#!/usr/bin/env bash
set -euo pipefail

# Submits a sample consumer assistance request and polls its status, so you can
# narrate the routing/reroute flow during a demo. Requires the api-server and
# ws-bridge to be running (see README).
API="${API_URL:-http://localhost:3000}"
ZIP="${ZIP:-33101}"
LANG="${LANG_PREF:-Spanish}"

echo "==> Submitting assistance request (ZIP $ZIP, $LANG)"
RESP=$(curl -sf -X POST "$API/requests" \
  -H "Content-Type: application/json" \
  -d "{\"firstName\":\"Demo\",\"lastName\":\"Consumer\",\"phone\":\"+15551234567\",\"zip\":\"$ZIP\",\"language\":\"$LANG\",\"consentTcpa\":true}")
echo "    $RESP"
REQ_ID=$(echo "$RESP" | sed -E 's/.*"requestId":"([^"]+)".*/\1/')

echo "==> Polling status for request $REQ_ID (Ctrl-C to stop)"
for i in $(seq 1 60); do
  STATUS=$(curl -sf "$API/requests/$REQ_ID")
  echo "    [$i] $STATUS"
  case "$STATUS" in
    *'"status":"Accepted"'*|*'"status":"InProgress"'*|*'"status":"Completed"'*) echo "Done."; break ;;
  esac
  sleep 2
done
