#!/bin/bash
# Restart the app for testing, on a clean port, and record the CDP target.
#
# Usage: scripts/restart-app.sh [port]
set -euo pipefail

PORT="${1:-9555}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# Stop any instance this script started previously.
if [ -f /tmp/spindle-app.pid ]; then
  OLD_PID="$(cat /tmp/spindle-app.pid)"
  if kill -0 "$OLD_PID" 2>/dev/null; then
    kill "$OLD_PID" 2>/dev/null || true
    sleep 1
  fi
fi

node_modules/electron/dist/Electron.app/Contents/MacOS/Electron \
  dist/main/main.js --remote-debugging-port="$PORT" > /tmp/spindle-electron.log 2>&1 &
APP_PID=$!
echo "$APP_PID" > /tmp/spindle-app.pid

# Wait for the debugging endpoint to come up and write the page target.
for _ in $(seq 1 40); do
  sleep 0.5
  WS=$(node -e "
    const http = require('http')
    http.get('http://127.0.0.1:${PORT}/json/list', (r) => {
      let d = ''
      r.on('data', (c) => (d += c))
      r.on('end', () => {
        try {
          const t = JSON.parse(d).find((x) => x.type === 'page')
          if (t) console.log(t.webSocketDebuggerUrl)
        } catch {}
      })
    }).on('error', () => {})
  " 2>/dev/null || true)
  if [ -n "${WS:-}" ]; then
    echo "WS=$WS"
    echo "WS=$WS" > /tmp/spindle.ws
    echo "PID=$APP_PID"
    exit 0
  fi
done

echo "the app did not expose a debugging target" >&2
tail -20 /tmp/spindle-electron.log >&2
exit 1
