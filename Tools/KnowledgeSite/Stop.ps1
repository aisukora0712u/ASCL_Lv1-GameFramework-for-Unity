$ErrorActionPreference = 'Stop'
$privateConfig = Join-Path $PSScriptRoot '.local/runtime.json'
if (Test-Path -LiteralPath $privateConfig) { $nodeExe = (Get-Content -LiteralPath $privateConfig -Raw | ConvertFrom-Json).node }
else { $nodeExe = (Get-Command node -ErrorAction Stop).Source }
& $nodeExe (Join-Path $PSScriptRoot 'server/control.ts') stop
if ($LASTEXITCODE -ne 0) { throw '无法确认服务身份，停止操作已取消。' }
