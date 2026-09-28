$ErrorActionPreference='Stop'
Set-Location $PSScriptRoot
npm run build
if ($LASTEXITCODE -ne 0) { throw '[react] build failed' }
Write-Host '[react] build complete'
