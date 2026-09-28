#!/usr/bin/env bash
set -e; curl -fsS http://localhost:8082 >/dev/null; curl -fsS http://localhost:8082/runtime-config.js | grep -q '__TVM_CONFIG__' || { echo '[react] runtime-config.js missing'; exit 1; }; echo '[react] OK'
