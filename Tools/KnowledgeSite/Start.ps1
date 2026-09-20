param([switch]$NoBrowser)
$ErrorActionPreference = 'Stop'
$privateConfig = Join-Path $PSScriptRoot '.local/runtime.json'
if (Test-Path -LiteralPath $privateConfig) { $nodeExe = (Get-Content -LiteralPath $privateConfig -Raw | ConvertFrom-Json).node }
else { $nodeExe = (Get-Command node -ErrorAction Stop).Source }
& $nodeExe (Join-Path $PSScriptRoot 'server/control.ts') start
if ($LASTEXITCODE -ne 0) { throw '网站启动失败，未停止其他程序。' }
if (-not $NoBrowser) { Start-Process 'http://127.0.0.1:4317' -WindowStyle Hidden }
