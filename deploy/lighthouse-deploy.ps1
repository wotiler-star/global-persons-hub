# ============================================================
# lighthouse-deploy.ps1
# 由腾讯云 TAT (RunCommand, POWERSHELL) 在 Lighthouse Windows 实例上执行。
# 调用方（本机）需先把构建产物分片上传到可达文件源（GitHub Release / COS），
# 再把本脚本 base64(UTF-8) 后作为 Content 下发，并调用 Lighthouse API 放行 Web 端口。
#
# 参数（全部由调用方注入，不落盘敏感值）：
#   $ReleaseBase  分片所在基础 URL，如 https://github.com/wotiler-star/global-persons-hub/releases/download/deploy
#   $ShardCount   分片数量
#   $ExpectedSize 原始 zip 总字节数（用于校验完整性）
#   $WebPort      对外 Web 端口（如 3000；若与既有站点共存则避开 80）
#   $SiteUrl      公开站点 URL（含协议与端口），如 http://<IP>:3000
#   $JwtSecret    API JWT 密钥（随机强串）
#   $AdminEmail / $AdminPass 管理后台账号
#
# ⚠️ 本脚本经 TAT 下发时，由 deploy/tat-deploy.py 做 {{占位符}} 字符串替换后再 base64。
#    占位符在本地不可直接运行（PowerShell 不识别 {{}}），仅用于部署管线注入。
# ============================================================
$ReleaseBase   = '{{ReleaseBase}}'
$ShardCount    = {{ShardCount}}
$ExpectedSize  = {{ExpectedSize}}
$WebPort       = {{WebPort}}
$SiteUrl       = '{{SiteUrl}}'
$JwtSecret     = '{{JwtSecret}}'
$AdminEmail    = '{{AdminEmail}}'
$AdminPass     = '{{AdminPass}}'

$ErrorActionPreference = 'Stop'
$ROOT = 'C:\www\gph'
$SHARDS = "$ROOT\shards"
$TARGET = "$ROOT\app"
New-Item -ItemType Directory -Force -Path $ROOT, $SHARDS, $TARGET | Out-Null

# 关键：TAT 以 Administrator 下发命令，pm2 默认守护落在 $env:USERPROFILE\.pm2（Administrator 临时守护），
# 会话结束即被回收，导致 gph-api/gph-web 进程随会话死亡、公网连接拒绝（curl exit 7）。
# 显式将 PM2_HOME 指向 SYSTEM 持久守护目录（与实例既有 ainav 应用一致），保证进程常驻、开机自启。
$env:PM2_HOME = 'C:\Windows\system32\config\systemprofile\.pm2'
if (-not (Test-Path $env:PM2_HOME)) { New-Item -ItemType Directory -Force -Path $env:PM2_HOME | Out-Null }

# 提前补齐 Node / npm 全局 bin 到 PATH（重部署时 node 通常已装），用于下方停掉旧进程以释放目录锁。
# 否则后续 Remove-Item $TARGET 会因文件被占用（gph-web-test 等遗留进程）而失败。
$nodeDir = 'C:\Program Files\nodejs'
if ($env:PATH -notlike "*$nodeDir*") { $env:PATH = "$env:PATH;$nodeDir" }
$npm = "$nodeDir\npm.cmd"
if (Test-Path $npm) {
  try {
    $npmPrefix = & $npm config get prefix 2>$null
    if ($npmPrefix -and $env:PATH -notlike "*$npmPrefix*") { $env:PATH = "$env:PATH;$npmPrefix" }
  } catch { }
  # 停掉旧 gph 进程，释放被锁定的 $TARGET 目录（含早前 PM2_HOME 验证遗留的 gph-web-test）
  # 注意：被删进程可能不存在，pm2 会返回非 0 并写 stderr；此处用 SilentlyContinue 避免
  # WinPS 在 $ErrorActionPreference='Stop' 下把"not found"当 NativeCommandError 终止整段脚本
  $eap = $ErrorActionPreference
  $ErrorActionPreference = 'SilentlyContinue'
  pm2 delete gph-web-test 2>&1 | Out-Null
  pm2 delete gph-api 2>&1 | Out-Null
  pm2 delete gph-web 2>&1 | Out-Null
  $ErrorActionPreference = $eap
  Start-Sleep -Seconds 2
}

# —— 1. 下载分片（直连，不走代理；每片小、可靠；支持断点续传）——
if (-not $ReleaseBase -or $ShardCount -le 0) { throw 'ReleaseBase / ShardCount 未提供' }
# 强制刷新分片缓存：删除旧分片，确保所有分片来自同一版本 Release，
# 避免新旧分片混拼导致拼接出的 app.zip 内部不一致、解压报“本地文件头已损坏”。
if (Test-Path $SHARDS) { Remove-Item "$SHARDS\*" -Recurse -Force -ErrorAction SilentlyContinue }
function Pad2($n) { if ($n -lt 10) { return '0' + [string]$n } return [string]$n }
# 每片标准大小（与 package.ps1 的 ShardMB=3 对应）；最后一片 = ExpectedSize - 前 (N-1) 片
$part_std = 3 * 1024 * 1024
for ($i = 0; $i -lt $ShardCount; $i = $i + 1) {
  $name = 'part' + (Pad2 $i) + '.zip'
  $url = $ReleaseBase + '/' + $name
  $dst = "$SHARDS\$name"
  # 续传：若已存在且大小正确则跳过
  if (Test-Path $dst) {
    $existing = (Get-Item $dst).Length
    if ($i -lt $ShardCount - 1) {
      if ($existing -eq $part_std) { Write-Output "skip (exists) $name"; continue }
    } else {
      # 最后一片期望大小
      $last_expect = $ExpectedSize - $part_std * ($ShardCount - 1)
      if ($existing -eq $last_expect) { Write-Output "skip (exists) $name"; continue }
    }
  }
  Write-Output "download $url"
  Invoke-WebRequest -Uri $url -OutFile $dst -UseBasicParsing
}

# —— 2. 拼接分片（WinPS 5.1 无 AppendAllBytes，用 cmd /c copy /b）——
$out = "$ROOT\app.zip"
if (Test-Path $out) { Remove-Item $out -Force }
$cmd = 'copy /b ' + ($SHARDS + '\part00.zip')
for ($i = 1; $i -lt $ShardCount; $i = $i + 1) { $cmd = $cmd + '+' + ($SHARDS + '\part' + (Pad2 $i) + '.zip') }
$cmd = $cmd + ' ' + $out
cmd /c $cmd
Start-Sleep -Seconds 1

# —— 3. 校验总字节数 ——
$real = (Get-Item $out).Length
if ($ExpectedSize -gt 0 -and $real -ne $ExpectedSize) {
  throw "分片拼接大小不符：期望 $ExpectedSize，实际 $real"
}
Write-Output "assembled $out size=$real"

# —— 4. 解压 ——
# 重部署时 $TARGET 已存在且可能被旧 gph 进程锁定：先停进程释放句柄，再彻底移除目录，
# 最后用 .NET ZipFile 解压（避免 PowerShell Expand-Archive -Force 在目标已存在时对
# "不存在的路径"抛 Remove-Item 异常这一 Windows PowerShell 5.1 已知 bug）。
$env:PM2_HOME = 'C:\Windows\system32\config\systemprofile\.pm2'
$eap = $ErrorActionPreference
$ErrorActionPreference = 'SilentlyContinue'
pm2 delete gph-api 2>&1 | Out-Null
pm2 delete gph-web 2>&1 | Out-Null
$ErrorActionPreference = $eap
Start-Sleep -Seconds 3
if (Test-Path $TARGET) {
  for ($r = 0; $r -lt 6; $r++) {
    Remove-Item $TARGET -Recurse -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2
    if (-not (Test-Path $TARGET)) { break }
  }
  if (Test-Path $TARGET) { Remove-Item $TARGET -Recurse -Force -ErrorAction Stop }
}
Add-Type -AssemblyName System.IO.Compression.FileSystem
[System.IO.Compression.ZipFile]::ExtractToDirectory($out, $TARGET)
Write-Output "extracted to $TARGET"

# —— 5. 写环境变量 ——
$WEBENV = "$TARGET\apps\web\.env"
$APIENV = "$TARGET\apps\api\.env"
$webEnvText = @"
NEXT_PUBLIC_SITE_URL=$SiteUrl
NEXT_PUBLIC_API_BASE=/api
GPH_API_BASE=http://127.0.0.1:8787
GPH_REVALIDATE=300
"@
$webEnvText | Set-Content -Path $WEBENV -Encoding utf8
$apiEnvText = @"
PORT=8787
API_BIND=127.0.0.1
STORE_DRIVER=json
JWT_SECRET=$JwtSecret
GPH_ADMIN_EMAIL=$AdminEmail
GPH_ADMIN_PASSWORD=$AdminPass
"@
$apiEnvText | Set-Content -Path $APIENV -Encoding utf8
Write-Output "env written"

# —— 6. 安装 Node（若缺失）——
$nodeDir = 'C:\Program Files\nodejs'
$haveNode = Test-Path "$nodeDir\node.exe"
if (-not $haveNode) {
  $ver = 'v22.22.0'
  $msi = "$ROOT\node.msi"
  Write-Output "installing node $ver"
  Invoke-WebRequest -Uri "https://registry.npmmirror.com/-/binary/node/$ver/node-$ver-x64.msi" -OutFile $msi -UseBasicParsing
  msiexec /i $msi /qn /norestart | Out-Null
  $p = [Environment]::GetEnvironmentVariable('PATH', 'Machine')
  if ($p -notlike "*$nodeDir*") {
    [Environment]::SetEnvironmentVariable('PATH', "$p;$nodeDir", 'Machine')
  }
  $env:PATH = "$env:PATH;$nodeDir"
} else { Write-Output 'node already present' }

# —— 7. 安装 pm2 + 日志轮转（2GB 实例必须限制日志体积，防止撑爆磁盘）——
# TAT shell 默认 PATH 不含 Node 安装目录；npm/pm2 全局命令必须经此补齐，否则 ENOENT
if ($env:PATH -notlike "*$nodeDir*") { $env:PATH = "$env:PATH;$nodeDir" }
$npm = "$nodeDir\npm.cmd"
& $npm config set registry https://registry.npmmirror.com
# 关键：确保 npm 全局 prefix 目录存在，否则 npm ls/install -g 会 ENOENT（lstat 缺失目录）
$npmPrefix = & $npm config get prefix
if ($npmPrefix) {
  if (-not (Test-Path $npmPrefix)) { New-Item -ItemType Directory -Force -Path $npmPrefix | Out-Null }
  if (-not (Test-Path "$npmPrefix\node_modules")) { New-Item -ItemType Directory -Force -Path "$npmPrefix\node_modules" | Out-Null }
  if ($env:PATH -notlike "*$npmPrefix*") { $env:PATH = "$env:PATH;$npmPrefix" }
}
# 用目录是否存在判断 pm2 是否已装（避免 npm ls -g 在 prefix 缺失时 ENOENT）
$pm2Pkg = if ($npmPrefix) { Join-Path $npmPrefix 'node_modules\pm2' } else { $null }
if (-not $pm2Pkg -or -not (Test-Path $pm2Pkg)) { & $npm install -g pm2 --no-audit --no-fund | Out-Null }
# 将 npm 全局 bin 目录写入 Machine PATH，使开机自启的 SYSTEM 任务也能找到 pm2 / node
if ($npmPrefix) {
  $mPath = [Environment]::GetEnvironmentVariable('PATH', 'Machine')
  if ($mPath -and $mPath -notlike "*$npmPrefix*") { [Environment]::SetEnvironmentVariable('PATH', "$mPath;$npmPrefix", 'Machine') }
  if ($mPath -and $mPath -notlike "*$nodeDir*") { [Environment]::SetEnvironmentVariable('PATH', "$mPath;$nodeDir", 'Machine') }
}
# 安装并配置 pm2-logrotate：单文件上限 10M、保留 7 份、每分钟检查
pm2 install pm2-logrotate 2>$null
pm2 set pm2-logrotate:max_size 10M 2>$null
pm2 set pm2-logrotate:retain 7 2>$null
pm2 set pm2-logrotate:compress true 2>$null
pm2 set pm2-logrotate:workerInterval 60 2>$null
New-Item -ItemType Directory -Force -Path "$ROOT\logs" | Out-Null
Write-Output 'pm2 ready'

# —— 8. 启动 API（Fastify；esbuild 编译为单文件后由 node 直跑，避免 tsx 派生子进程导致 pm2 信号无法送达）——
# 原生命令（npm/pm2）会把摘要/进度写到 stderr，WinPS 在 $ErrorActionPreference='Stop' 下会误报
# NativeCommandError；此处放宽到 SilentlyContinue，改用显式 $LASTEXITCODE 判断真实失败
$ErrorActionPreference = 'SilentlyContinue'
# 清理历史诊断/孤儿进程（如早前 PM2_HOME 验证留下的 gph-web-test），避免占用端口与堆积
pm2 delete gph-web-test 2>&1 | Out-Null
pm2 delete gph-api 2>&1 | Out-Null
pm2 delete gph-web 2>&1 | Out-Null
Set-Location "$TARGET\apps\api"
if (-not (Test-Path node_modules)) {
  & $npm install --no-audit --no-fund 2>&1 | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "API npm install 失败（exit $LASTEXITCODE）" }
}
# @gph/types 是工作区私有包，npm install 无法从 registry 解析，需从随包附带的 packages/types 拷入
# （仅供 tsx 开发路径使用；生产已通过 esbuild 打包进 dist/server.mjs，此处拷贝不影响生产）
if (-not (Test-Path node_modules/@gph/types)) { New-Item -ItemType Directory -Force -Path node_modules/@gph/types | Out-Null }
Copy-Item -Recurse -Force ..\..\packages\types\* node_modules/@gph/types
# 编译 API 为 dist/server.mjs（@gph/types 已内联，fastify 等保持外部依赖）
# 注意：esbuild 把构建摘要写到 stderr；用 2>&1 合并后丢弃，避免 PowerShell 把 stderr 当作终止错误误判失败
& $npm run build --no-audit --no-fund 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) { throw "API 构建失败（esbuild exit $LASTEXITCODE）" }
if (-not (Test-Path dist/server.mjs)) { throw 'API 构建失败：dist/server.mjs 未生成' }
$ErrorActionPreference = 'Stop'
Write-Output "API 构建完成（dist/server.mjs）"

# —— 9. 校验 Web 产物（standalone server.js）——
Set-Location "$TARGET\apps\web"
if (-not (Test-Path server.js)) { throw 'Web server.js 未找到' }
Write-Output "Web server.js 就绪"
# 注意：gph-api / gph-web 的 pm2 启动交由第 10 段以 SYSTEM 账户的计划任务完成，
# 以确保进程归入 SYSTEM 持久守护（PM2_HOME=systemprofile），TAT 会话结束后不会随会话回收。
# （TAT 以 Administrator 下发时，pm2 无法挂载到 SYSTEM 守护，会另起一个随会话消亡的临时守护。）

# —— 10. 开机自启（SYSTEM 账户 AtStartup）——
$script = "$ROOT\start-gph.ps1"
$bootScript = @"
`$env:PATH = [Environment]::GetEnvironmentVariable('PATH','Machine')
# 开机自启以 SYSTEM 运行：显式补齐 node 与 npm 全局 bin（pm2 落点），避免 PATH 缺失
`$nodeDir = 'C:\Program Files\nodejs'
if (`$env:PATH -notlike "*`$nodeDir*") { `$env:PATH = "`$env:PATH;`$nodeDir" }
`$npmPrefix = & "$nodeDir\npm.cmd" config get prefix 2>`$null
if (`$npmPrefix -and `$env:PATH -notlike "*`$npmPrefix*") { `$env:PATH = "`$env:PATH;`$npmPrefix" }
# 与 TAT 部署时一致：绑定到 SYSTEM 持久守护目录，确保进程归入同一处 pm2 实例
`$env:PM2_HOME = 'C:\Windows\system32\config\systemprofile\.pm2'
pm2 ping 2>`$null
# 清理可能残留的 gph 进程（含 dump 中失效条目），随后按完整配置重新拉起
pm2 delete gph-api 2>`$null
pm2 delete gph-web 2>`$null
# ⚠️ gph-api 必须监听 8787（与 Web 的 GPH_API_BASE / next.config 重写目标一致）。
# 此处绝不能用 `$WebPort`：否则 API 与 Web 抢 3000，且 Web 代理目标 127.0.0.1:8787
# 无进程监听，导致所有 /api/* 请求 500（ECONNREFUSED 127.0.0.1:8787）。
`$env:PORT = '8787'
`$env:API_BIND = '127.0.0.1'
# 注意：pm2 会把引号内的 "node dist/server.mjs" 整体当作脚本路径（含空格），
# 导致 "Script not found: ...\node dist\server.mjs"。正确写法：脚本用 dist/server.mjs，
# 通过 --interpreter node 指定解释器，pm2 会执行 node dist/server.mjs。
pm2 start dist/server.mjs --name gph-api --interpreter node --cwd "$TARGET\apps\api" --max-memory-restart 1500M --max-restarts 10
# gph-web 监听公网 WebPort（与 gph-api 的 8787 分离，避免端口冲突）
`$env:PORT = '$WebPort'
pm2 start server.js --name gph-web --cwd "$TARGET\apps\web" --max-memory-restart 1500M --max-restarts 10
pm2 save
"@
$bootScript | Set-Content -Path $script -Encoding utf8
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-File $script"
$trigger = New-ScheduledTaskTrigger -AtStartup
Register-ScheduledTask -TaskName 'StartGlobalPersonsHub' -Action $action -Trigger $trigger -User 'SYSTEM' -Force
# 立即以 SYSTEM 身份触发一次，使 gph 在当前会话就归入 SYSTEM 持久守护（不依赖重启）
schtasks /Run /TN StartGlobalPersonsHub 2>&1 | Out-Null
Start-Sleep -Seconds 15
# 校验：以 SYSTEM 守护视角确认 gph 已拉起
$env:PM2_HOME = 'C:\Windows\system32\config\systemprofile\.pm2'
$jlist = pm2 jlist 2>$null
if ($jlist -notmatch 'gph-api' -or $jlist -notmatch 'gph-web') { throw 'SYSTEM 任务未成功拉起 gph-api / gph-web' }
Write-Output 'DONE'
