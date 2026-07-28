# ============================================================
# package.ps1  （在本机 / CI 构建机运行）
# 产出可直接下发到 Lighthouse 的分片 zip。
# 用法：
#   pwsh deploy/package.ps1 -SiteUrl http://<IP>:3000 -OutDir deploy/dist
# 结束后输出 ExpectedSize 与 ShardCount，交给 lighthouse-deploy.ps1 与上传步骤。
# ============================================================
param(
  [string]$SiteUrl = 'http://127.0.0.1:3000',
  [string]$OutDir = 'deploy/dist',
  [int]$ShardMB = 3
)

$ErrorActionPreference = 'Stop'
$Repo = (Get-Item $PSScriptRoot).Parent.FullName
Set-Location $Repo
$WEB = Join-Path $Repo 'apps/web'

# —— 1. 构建 web standalone（NEXT_PUBLIC_* 构建期内联）——
$env:NEXT_PUBLIC_SITE_URL = $SiteUrl
$env:NEXT_PUBLIC_API_BASE = '/api'
Write-Output "building web standalone for $SiteUrl ..."
npm -w @gph/web run build

# —— 2. 拷贝 static 进 standalone ——
$standalone = Join-Path $WEB '.next/standalone'
$staticSrc = Join-Path $WEB '.next/static'
$staticDst = Join-Path $standalone 'apps/web/.next/static'
if (Test-Path $staticSrc) {
  if (-not (Test-Path $staticDst)) { New-Item -ItemType Directory -Force -Path $staticDst | Out-Null }
  Copy-Item -Recurse -Force $staticSrc\* $staticDst
}

# —— 3. 组装部署根：standalone 内容 + api 源码 + 共享 types ——
$app = Join-Path $OutDir 'app'
if (Test-Path $app) { Remove-Item $app -Recurse -Force }
New-Item -ItemType Directory -Force -Path $app | Out-Null
Copy-Item -Recurse -Force $standalone\* $app
# api：仅源码 + data + package.json（不含 node_modules / .next）
$cfg = Join-Path $app 'apps/api'
New-Item -ItemType Directory -Force -Path $cfg | Out-Null
Copy-Item -Recurse -Force (Join-Path $Repo 'apps/api/src') $cfg
Copy-Item -Recurse -Force (Join-Path $Repo 'apps/api/data') $cfg
Copy-Item -Force (Join-Path $Repo 'apps/api/package.json') $cfg
# 共享类型包（API 运行时需 @gph/types）
$copyTypes = Join-Path $app 'packages/types'
New-Item -ItemType Directory -Force -Path $copyTypes | Out-Null
Copy-Item -Recurse -Force (Join-Path $Repo 'packages/types/*') $copyTypes

# —— 4. 压缩 ——
$zip = Join-Path $OutDir 'app.zip'
if (Test-Path $zip) { Remove-Item $zip -Force }
Compress-Archive -Path (Join-Path $app '*') -DestinationPath $zip
$size = (Get-Item $zip).Length
Write-Output "app.zip size = $size bytes"

# —— 5. 分片（每片 ShardMB，cmd /b 在服务器拼接）——
$shardDir = Join-Path $OutDir 'shards'
if (Test-Path $shardDir) { Remove-Item $shardDir -Recurse -Force }
New-Item -ItemType Directory -Force -Path $shardDir | Out-Null
$bytes = [System.IO.File]::ReadAllBytes($zip)
$chunk = $ShardMB * 1024 * 1024
$count = [math]::Ceiling($size / $chunk)
for ($i = 0; $i -lt $count; $i++) {
  $start = $i * $chunk
  $len = [math]::Min($chunk, $size - $start)
  $part = New-Object byte[] $len
  [Array]::Copy($bytes, $start, $part, 0, $len)
  $name = 'part' + ('{0:00}' -f $i) + '.zip'
  [System.IO.File]::WriteAllBytes((Join-Path $shardDir $name), $part)
}
Write-Output "=================================================="
Write-Output "ShardCount = $count"
Write-Output "ExpectedSize = $size"
Write-Output "分片位于: $shardDir  （上传到 GitHub Release / COS 后，把基础 URL 传给 lighthouse-deploy.ps1）"
Write-Output "=================================================="
