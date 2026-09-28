#!/usr/bin/env bash
# React 정적 서버(:8082) — dist/ 를 python http.server 로 서빙한다. 기동할 때마다 react/.env 의
# VITE_PORTAL_API_BASE / VITE_AGENT_URL / VITE_EXPORTER_URL 을 dist/runtime-config.js 로 주입한다
# (src/runtimeConfig.ts — 런타임 > VITE_(빌드) > same-origin Spring API / 페이지 호스트 agent-exporter 기본값).
# 주소 변경은 재빌드가 아니라 **재기동**으로 반영된다.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; PID="$ROOT/run/react.pid"; DIST="$ROOT/dist"
mkdir -p "$ROOT/logs" "$ROOT/run"; [[ -f "$DIST/index.html" ]] || { echo '[react] dist missing - run build-react.sh'; exit 1; }
if [[ -f "$PID" ]] && kill -0 "$(cat "$PID")" 2>/dev/null; then echo '[react] already running'; exit 0; fi
pairs=""
add_pair() { local key="$1" var="$2" val=""
  [[ -f "$ROOT/.env" ]] && val="$(grep -E "^\s*${var}\s*=" "$ROOT/.env" | tail -1 | sed -E "s/^[^=]*=\s*//; s/^[\"']//; s/[\"']\s*$//; s/\s+$//")" || true
  [[ -n "$val" ]] && pairs="${pairs}${pairs:+, }\"${key}\": \"${val}\""; }
add_pair portalApiUrl VITE_PORTAL_API_BASE; add_pair agentUrl VITE_AGENT_URL; add_pair exporterUrl VITE_EXPORTER_URL
{ echo "/* start-react 가 기동 시 react/.env 로부터 생성 - 직접 편집하지 말 것 */"; echo "window.__TVM_CONFIG__ = {${pairs}};"; } > "$DIST/runtime-config.js"
if [[ -n "$pairs" ]]; then echo "[react] runtime-config: ${pairs} (react/.env - 변경은 재기동으로 반영)"; else echo "[react] runtime-config: 오버라이드 없음 - same-origin Spring API / 페이지 호스트 agent-exporter 기본값"; fi
PY=python3; [[ -x "$ROOT/../python/.venv/bin/python" ]] && PY="$ROOT/../python/.venv/bin/python"
nohup "$PY" -m http.server 8082 --bind 0.0.0.0 --directory "$DIST" >"$ROOT/logs/react.out.log" 2>"$ROOT/logs/react.err.log" & echo $! > "$PID"; echo "[react] started PID $(cat "$PID") - http://localhost:8082"
