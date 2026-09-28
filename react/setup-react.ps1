$ErrorActionPreference='Stop'
Set-Location $PSScriptRoot
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) { throw '[react] npm not found' }
npm install
if ($LASTEXITCODE -ne 0) { throw '[react] npm install failed' }
Write-Host '[react] setup complete'
