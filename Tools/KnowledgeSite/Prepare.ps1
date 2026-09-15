param([string]$NodePath, [string]$PnpmPath)
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
if (-not $NodePath) { $NodePath = (Get-Command node -ErrorAction Stop).Source }
if (-not $PnpmPath) { $PnpmPath = (Get-Command pnpm -ErrorAction Stop).Source }
$version = & $NodePath --version
if ($version -notmatch '^v24\.') { throw '请安装 Node.js 24，再执行首次依赖准备。' }
$env:CI = 'true'
& $PnpmPath install --frozen-lockfile
if ($LASTEXITCODE -ne 0) { throw '依赖安装失败。' }
& $NodePath node_modules/typescript/bin/tsc --noEmit
if ($LASTEXITCODE -ne 0) { throw '类型检查失败。' }
& $NodePath node_modules/vite/bin/vite.js build
if ($LASTEXITCODE -ne 0) { throw '生产构建失败。' }
$privateDir = Join-Path $PSScriptRoot '.local'
New-Item -ItemType Directory -Path $privateDir -Force | Out-Null
@{ node = $NodePath } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $privateDir 'runtime.json') -Encoding utf8
Write-Host '依赖与生产构建已准备完成。日常运行 Start.ps1 / Stop.ps1，不会安装或升级依赖。'
