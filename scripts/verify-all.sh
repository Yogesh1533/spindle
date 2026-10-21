#!/bin/bash
# Run every check against the running app and print a summary.
#
# Usage: scripts/verify-all.sh [ws-url]
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

WS="${1:-$(sed 's/^WS=//' /tmp/slate.ws)}"
if [ -z "$WS" ]; then
  echo "no CDP target; start the app with scripts/restart-app.sh first" >&2
  exit 1
fi

total_pass=0
total_fail=0
failed_scripts=()

run() {
  local name="$1"
  shift
  local out
  out="$(node "$@" 2>&1)"
  local passes fails
  passes="$(echo "$out" | grep -c '^PASS' || true)"
  fails="$(echo "$out" | grep -c '^FAIL' || true)"
  total_pass=$((total_pass + passes))
  total_fail=$((total_fail + fails))
  printf '%-26s %3d pass  %3d fail\n' "$name" "$passes" "$fails"
  if [ "$fails" != "0" ]; then
    echo "$out" | grep '^FAIL' | sed 's/^/    /'
    failed_scripts+=("$name")
  fi
}

run "features"      scripts/cdp-probe.mjs "$WS" scripts/verify-features.js
run "deep"          scripts/cdp-probe.mjs "$WS" scripts/verify-deep.js
run "watch"         scripts/verify-watch.mjs "$WS"
run "settings"      scripts/verify-settings.mjs "$WS"
run "autocomplete"  scripts/verify-autocomplete.mjs "$WS"
run "headings"      scripts/verify-headings.mjs "$WS"
run "panes"         scripts/verify-panes.mjs "$WS"

echo
echo "total: $total_pass pass, $total_fail fail"
if [ ${#failed_scripts[@]} -gt 0 ]; then
  echo "failing: ${failed_scripts[*]}"
  exit 1
fi
