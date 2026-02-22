#!/usr/bin/env bash
set -euo pipefail

# ── ClawPay plugin setup ────────────────────────────────────────────────────
# Called by the curl installer OR manually:
#   ./bin/setup.sh <PAIRING_CODE>

bold()  { printf '\033[1m%s\033[0m' "$*"; }
green() { printf '\033[32m%s\033[0m' "$*"; }
red()   { printf '\033[31m%s\033[0m' "$*"; }

fail() { printf '\n  %s %s\n\n' "$(red "Error:")" "$1"; exit 1; }

CODE="${1:-}"
if [ -z "$CODE" ]; then
  fail "Usage: ./bin/setup.sh <PAIRING_CODE>"
fi

# Validate code format (6 digits)
if ! echo "$CODE" | grep -qE '^[0-9]{6}$'; then
  fail "Pairing code must be exactly 6 digits."
fi

API_BASE="https://www.clawpay.tech"
PLUGIN_DIR="$(cd "$(dirname "$0")/.." && pwd)"
CONFIG_FILE="$PLUGIN_DIR/config.json"

printf '  %s\n' "$(bold "ClawPay Plugin Setup")"
printf '  Exchanging pairing code ...\n'

# Exchange pairing code for API token
RESPONSE=$(curl -sL -w "\n%{http_code}" -X POST "$API_BASE/api/pair" \
  -H "Content-Type: application/json" \
  -d "{\"code\":\"$CODE\"}")

HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [ "$HTTP_CODE" != "200" ]; then
  ERROR=$(echo "$BODY" | grep -o '"error":"[^"]*"' | head -1 | cut -d'"' -f4)
  fail "${ERROR:-Pairing failed (HTTP $HTTP_CODE)}"
fi

API_TOKEN=$(echo "$BODY" | grep -o '"api_token":"[^"]*"' | head -1 | cut -d'"' -f4)
USER_ID=$(echo "$BODY" | grep -o '"user_id":"[^"]*"' | head -1 | cut -d'"' -f4)

if [ -z "$API_TOKEN" ]; then
  fail "Could not extract API token from server response."
fi

# Save config
cat > "$CONFIG_FILE" <<EOF
{
  "api_token": "$API_TOKEN",
  "user_id": "$USER_ID",
  "api_base": "$API_BASE",
  "paired_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF

printf '  %s\n' "$(green "Paired successfully!")"
printf '\n'
printf '  API token saved to %s\n' "$CONFIG_FILE"
printf '  User ID: %s\n' "$USER_ID"
printf '\n'

# Register with OpenClaw if the CLI is available
if command -v openclaw &>/dev/null; then
  printf '  Registering plugin with OpenClaw ...\n'
  openclaw plugins install -l "$PLUGIN_DIR" 2>/dev/null && \
    printf '  %s\n' "$(green "Plugin registered.")" || \
    printf '  %s\n' "$(red "Could not auto-register. Run: openclaw plugins install -l $PLUGIN_DIR")"
fi

printf '\n  %s\n\n' "$(bold "Restart OpenClaw to activate ClawPay.")"
