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
# ============================================================
param(
  [string]$ReleaseBase = '',
  [int]$ShardCount = 0,
  [long]$ExpectedSize = 0,
  [int]$WebPort = 3000,
  [string]$SiteUrl = 'http://127.0.0.1:3000',
  [string]$JwtSecret = 'change-me',
  [string]$AdminEmail = 'admin@gph.local',
  [string]$AdminPass = 'change-me'
)

$ErrorActionPreference = 'Stop'
$ROOT = 'C:\www\gph'
$SHARDS = "$ROOT\shards"
$TARGET = "$ROOT\app"
New-Item -ItemType Directory -Force -Path $ROOT, $SHARDS, $TARGET | Out-Null

# —— 1. 下载分片（直连，不走代理；每片小、可靠）——
if (-not $ReleaseBase -or $ShardCount -le 0) { throw 'ReleaseBase / ShardCount 未提供' }
function Pad2($n) { if ($n -lt 10) { return '0' + [string]$n } return [string]$n }
for ($i = 0; $i -lt $ShardCount; $i = $i + 1) {
  $name = 'part' + (Pad2 $i) + '.zip'
  $url = $ReleaseBase + '/' + $name
  $dst = "$SHARDS\$name"
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
if (Test-Path $TARGET) { Remove-Item $TARGET -Recurse -Force }
Expand-Archive -Path $out -DestinationPath $TARGET -Force
Write-Output "extracted to $TARGET"

# —— 5. 写环境变量 ——
$WEBENV = "$TARGET\apps\web\.env"
$APIENV = "$TARGET\apps\api\.env"
@"
NEXT_PUBLIC_SITE_URL=$SiteUrl
NEXT_PUBLIC_API_BASE=/api
GPH_API_BASE=http://127.0.0.1:8787
GPH_REVALIDATE=300
"@ | Set-Content -Path $WEBENV -Encoding utf8
@"
PORT=8787
STORE_DRIVER=json
JWT_SECRET=$JwtSecret
GPH_ADMIN_EMAIL=$AdminEmail
GPH_ADMIN_PASSWORD=$AdminPass
"@ | Set-Content -Path $APIENV -Encoding utf8
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

# —— 7. 安装 pm2 ——
npm config set registry https://registry.npmmirror.com
$present = npm ls -g pm2 --depth=0 2>$null
if ($present -notmatch 'pm2@') { npm install -g pm2 --no-audit --no-fund | Out-Null }
Write-Output 'pm2 ready'

# —— 8. 启动 API（Fastify/tsx，JSON store）——
Set-Location "$TARGET\apps\api"
if (-not (Test-Path node_modules)) { npm install --no-audit --no-fund | Out-Null }
# @gph/types 是工作区私有包，npm install 无法从 registry 解析，需从随包附带的 packages/types 拷入
if (-not (Test-Path node_modules/@gph/types)) { New-Item -ItemType Directory -Force -Path node_modules/@gph/types | Out-Null }
Copy-Item -Recurse -Force ..\..\packages\types\* node_modules/@gph/types
pm2 delete gph-api 2>$null
pm2 start "npx tsx src/server.ts" --name gph-api --cwd "$TARGET\apps\api"

# —— 9. 启动 Web（Next standalone server.js）——
Set-Location "$TARGET\apps\web"
$env:PORT = [string]$WebPort
pm2 delete gph-web 2>$null
pm2 start server.js --name gph-web --cwd "$TARGET\apps\web"
pm2 save
Write-Output "pm2 started gph-api + gph-web on port $WebPort"

# —— 10. 开机自启（SYSTEM 账户 AtStartup）——
$script = "$ROOT\start-gph.ps1"
@"
`$env:PATH = [Environment]::GetEnvironmentVariable('PATH','Machine')
`$env:PORT = '$WebPort'
pm2 restart gph-api
pm2 restart gph-web
"@ | Set-Content -Path $script -Encoding utf8
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-File $script"
$trigger = New-ScheduledTaskTrigger -AtStartup
Register-ScheduledTask -TaskName 'StartGlobalPersonsHub' -Action $action -Trigger $trigger -User 'SYSTEM' -Force
Write-Output 'DONE'
