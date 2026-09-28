$ErrorActionPreference='Stop'
try { $r=Invoke-WebRequest -UseBasicParsing http://localhost:8082 -TimeoutSec 5; $c=Invoke-WebRequest -UseBasicParsing http://localhost:8082/runtime-config.js -TimeoutSec 5; if ($c.Content -notmatch '__TVM_CONFIG__') { throw 'runtime-config.js missing' }; Write-Host '[react] OK' } catch { throw "[react] verify failed: $_" }
