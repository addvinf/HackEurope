#!/usr/bin/env bash
set -euo pipefail

# ── ClawPay One-Command Setup ──────────────────────────────────────────────────
# Usage: ./bin/setup.sh <PAIRING_CODE> [--api-url https://clawpay.example.com]

DEFAULT_API_URL="http://localhost:3000"
PLUGIN_DIR="$(cd "$(dirname "$0")/.." && pwd)"

# ── Helpers ────────────────────────────────────────────────────────────────────

bold()  { printf '\033[1m%s\033[0m' "$*"; }
green() { printf '\033[32m%s\033[0m' "$*"; }
red()   { printf '\033[31m%s\033[0m' "$*"; }
dim()   { printf '\033[2m%s\033[0m' "$*"; }

step() { printf '\n  [%s/3] %s\n' "$1" "$2"; }
ok()   { printf '        %s\n' "$(green "Done.")"; }
fail() { printf '        %s %s\n' "$(red "Error:")" "$1"; exit 1; }

usage() {
  cat <<EOF

  $(bold "ClawPay Setup")

  Links the ClawPay plugin into OpenClaw, pairs with a 6-digit code,
  and persists the API token — all in one command.

  $(bold "Usage:")
    $(dim "./bin/setup.sh") <PAIRING_CODE> [--api-url <URL>]

  $(bold "Arguments:")
    PAIRING_CODE   6-digit code from the ClawPay dashboard
    --api-url      ClawPay API URL (default: $DEFAULT_API_URL)

  $(bold "Examples:")
    ./bin/setup.sh 483291
    ./bin/setup.sh 483291 --api-url https://clawpay.myapp.com

EOF
  exit 1
}

# ── Parse JSON helper (works with python3 or jq) ──────────────────────────────

json_get() {
  local json="$1" key="$2"
  if command -v python3 &>/dev/null; then
    printf '%s' "$json" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('$key',''))"
  elif command -v jq &>/dev/null; then
    printf '%s' "$json" | jq -r ".$key // empty"
  else
    fail "Neither python3 nor jq found. Install one of them to continue."
  fi
}

# ── Parse arguments ────────────────────────────────────────────────────────────

PAIRING_CODE=""
API_URL="$DEFAULT_API_URL"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --api-url)
      [[ -z "${2:-}" ]] && fail "--api-url requires a value"
      API_URL="$2"; shift 2 ;;
    -h|--help)
      usage ;;
    *)
      if [[ -z "$PAIRING_CODE" ]]; then
        PAIRING_CODE="$1"; shift
      else
        fail "Unexpected argument: $1"
      fi ;;
  esac
done

[[ -z "$PAIRING_CODE" ]] && usage

# Validate code is 6 digits
if ! [[ "$PAIRING_CODE" =~ ^[0-9]{6}$ ]]; then
  fail "Pairing code must be exactly 6 digits (got: $PAIRING_CODE)"
fi

# ── Preflight checks ──────────────────────────────────────────────────────────

command -v curl &>/dev/null || fail "'curl' is not installed."
command -v openclaw &>/dev/null || fail "'openclaw' is not on your PATH. Install OpenClaw first."

# ── Go ─────────────────────────────────────────────────────────────────────────

printf '\n  %s\n' "$(bold "ClawPay Setup")"

# Step 1 — Install plugin
step 1 "Installing ClawPay plugin..."

if openclaw plugins list 2>/dev/null | grep -q clawpay; then
  printf '        %s\n' "$(dim "Already installed, skipping.")"
else
  if ! openclaw plugins install -l "$PLUGIN_DIR" 2>/dev/null; then
    fail "Could not install plugin. Is the openclaw CLI working?"
  fi
  ok
fi

# Step 2 — Pair with ClawPay
step 2 "Pairing with ClawPay (${API_URL})..."

PAIR_RESPONSE=$(curl -sf -X POST "${API_URL}/api/pair" \
  -H "Content-Type: application/json" \
  -d "{\"code\": \"${PAIRING_CODE}\"}" 2>&1) || {
  fail "Could not reach ${API_URL}/api/pair — is the ClawPay server running?"
}

API_TOKEN=$(json_get "$PAIR_RESPONSE" "api_token")
ERROR_MSG=$(json_get "$PAIR_RESPONSE" "error")

if [[ -n "$ERROR_MSG" ]]; then
  fail "Pairing failed: $ERROR_MSG"
fi

if [[ -z "$API_TOKEN" ]]; then
  fail "Pairing response did not contain an api_token. Response: $PAIR_RESPONSE"
fi

printf '        %s\n' "$(green "Paired successfully!")"

# Step 3 — Save configuration
step 3 "Saving configuration..."

SAVE_FAILED=0
openclaw config set plugins.entries.clawpay.config.apiToken "$API_TOKEN" 2>/dev/null || SAVE_FAILED=1
openclaw config set plugins.entries.clawpay.config.apiUrl "$API_URL" 2>/dev/null   || SAVE_FAILED=1

if [[ "$SAVE_FAILED" -eq 1 ]]; then
  printf '        %s\n' "$(red "Could not save config automatically.")"
  printf '        Add these to your openclaw.json manually:\n'
  printf '          %s\n' "$(dim "plugins.entries.clawpay.config.apiToken = $API_TOKEN")"
  printf '          %s\n' "$(dim "plugins.entries.clawpay.config.apiUrl   = $API_URL")"
else
  ok
fi

# ── Done ───────────────────────────────────────────────────────────────────────

printf '\n  %s\n\n' "$(green "ClawPay is ready.") Restart your OpenClaw gateway to activate."
