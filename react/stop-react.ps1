$PidFile=Join-Path $PSScriptRoot 'run\react.pid'
if (Test-Path $PidFile) { $pidValue=Get-Content $PidFile; Stop-Process -Id $pidValue -Force -ErrorAction SilentlyContinue; Remove-Item $PidFile -Force -ErrorAction SilentlyContinue }
Write-Host '[react] stopped'
