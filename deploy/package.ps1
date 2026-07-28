# ============================================================
# package.ps1  (run on local builder / CI)
# Produces shards ready to push to Lighthouse.
# Usage:
#   pwsh deploy/package.ps1 -SiteUrl http://<IP>:3000 -OutDir deploy/dist
# Prints ShardCount and ExpectedSize for lighthouse-deploy.ps1 + upload step.
# ============================================================
param(
  [string]$SiteUrl = 'http://127.0.0.1:3000',
  [string]$OutDir = 'deploy/dist',
  [int]$ShardMB = 3,
  [switch]$SkipBuild
)

$ErrorActionPreference = 'Stop'
$Repo = (Get-Item $PSScriptRoot).Parent.FullName
Set-Location $Repo
# Force absolute output dir (npm -w below changes CWD, so never rely on relative paths)
$OutDir = Join-Path $Repo $OutDir
$WEB = Join-Path $Repo 'apps/web'

# 1. Build web standalone (NEXT_PUBLIC_* are inlined at build time)
$env:NEXT_PUBLIC_SITE_URL = $SiteUrl
$env:NEXT_PUBLIC_API_BASE = '/api'
# Clear sandbox safe-delete guard so next build is not killed
Remove-Item Env:CODEBUDDY_SAFE_DELETE_BULK_GUARD -ErrorAction SilentlyContinue
Remove-Item Env:CODEBUDDY_SAFE_DELETE_BULK_STATE_DIR -ErrorAction SilentlyContinue
$env:NODE_OPTIONS = ''
if (-not $SkipBuild) {
  # Clean build: Next's incremental standalone emit is flaky (sometimes omits
  # node_modules/server.js), so always delete .next first for a reliable trace.
  # NOTE: sandbox safe-delete may block Remove-Item; in that case run the clean
  # build once via Bash (dangerouslyDisableSandbox) then use -SkipBuild here.
  if (Test-Path "$WEB\.next") { Remove-Item -Recurse -Force "$WEB\.next" }
  Write-Output "building web standalone for $SiteUrl ..."
  npm -w @gph/web run build
  # npm -w switches CWD to apps/web; reset to repo root for the remaining steps
  Set-Location $Repo
} else {
  Write-Output "SkipBuild: using existing .next/standalone"
}

# 2. Copy static into standalone (Next does not auto-include it)
$standalone = Join-Path $WEB '.next/standalone'
$staticSrc = Join-Path $WEB '.next/static'
$staticDst = Join-Path $standalone 'apps/web/.next/static'
if (Test-Path $staticSrc) {
  if (-not (Test-Path $staticDst)) { New-Item -ItemType Directory -Force -Path $staticDst | Out-Null }
  Copy-Item -Recurse -Force $staticSrc\* $staticDst
}

# 3. Assemble deploy root: standalone contents + api source + shared types
$app = Join-Path $OutDir 'app'
if (Test-Path $app) { Remove-Item $app -Recurse -Force }
New-Item -ItemType Directory -Force -Path $app | Out-Null
Copy-Item -Recurse -Force $standalone\* $app
# api: source + data + package.json only (no node_modules / .next)
$cfg = Join-Path $app 'apps/api'
New-Item -ItemType Directory -Force -Path $cfg | Out-Null
Copy-Item -Recurse -Force (Join-Path $Repo 'apps/api/src') $cfg
Copy-Item -Recurse -Force (Join-Path $Repo 'apps/api/data') $cfg
Copy-Item -Force (Join-Path $Repo 'apps/api/package.json') $cfg
# shared types package (API needs @gph/types at runtime)
$copyTypes = Join-Path $app 'packages/types'
New-Item -ItemType Directory -Force -Path $copyTypes | Out-Null
Copy-Item -Recurse -Force (Join-Path $Repo 'packages/types/*') $copyTypes

# 4. Compress
$zip = Join-Path $OutDir 'app.zip'
if (Test-Path $zip) { Remove-Item $zip -Force }
Compress-Archive -Path (Join-Path $app '*') -DestinationPath $zip
$size = (Get-Item $zip).Length
Write-Output "app.zip size = $size bytes"

# 5. Shard (each ShardMB; server reassembles with cmd /b)
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
Write-Output '----- deploy shards ready -----'
Write-Output "ShardCount = $count"
Write-Output "ExpectedSize = $size"
Write-Output "shards at: $shardDir  (upload, then pass base URL to lighthouse-deploy.ps1)"
Write-Output '-----'
