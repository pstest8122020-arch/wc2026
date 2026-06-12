#!/bin/bash
# Headless daily refresh for jupvitals (https://jupvitals.fly.dev).
# Run by launchd: ~/Library/LaunchAgents/com.jupvitals.refresh.plist
# Pulls live Discord data from ClickHouse, rebuilds the data files, deploys to Fly.
# No browser / Chrome / Discord login required.
set -uo pipefail

REPO="/Users/ag/bracket/discord-alpha-dashboard"
NODE="/usr/local/bin/node"
FLY="/Users/ag/.fly/bin/fly"
LOG="$REPO/ops/refresh.log"

cd "$REPO" || { echo "no repo $(date -u)" >> "$LOG"; exit 1; }
# keep the log bounded
[ -f "$LOG" ] && tail -n 800 "$LOG" > "$LOG.tmp" 2>/dev/null && mv "$LOG.tmp" "$LOG"

echo "===== $(date -u '+%Y-%m-%dT%H:%M:%SZ') UTC =====" >> "$LOG"
if "$NODE" server/ch-refresh.mjs       >> "$LOG" 2>&1 \
   && "$NODE" server/ch-alpha-refresh.mjs >> "$LOG" 2>&1 \
   && "$FLY" deploy --remote-only --ha=false >> "$LOG" 2>&1; then
  echo "[ok] $(date -u '+%H:%M:%SZ')" >> "$LOG"
  osascript -e 'display notification "Refreshed via ClickHouse + deployed" with title "jupvitals"' 2>/dev/null || true
else
  echo "[FAIL] $(date -u '+%H:%M:%SZ')" >> "$LOG"
  osascript -e 'display notification "Daily refresh FAILED — see ops/refresh.log" with title "jupvitals"' 2>/dev/null || true
  exit 1
fi
