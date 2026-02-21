import { NextRequest } from "next/server";

const INSTALL_SCRIPT = `#!/usr/bin/env bash
set -euo pipefail

# ── ClawPay curl installer ───────────────────────────────────────────────────
# Usage: curl -fsSL https://clawpay.tech/install | bash -s -- <PAIRING_CODE>

bold()  { printf '\\033[1m%s\\033[0m' "$*"; }
green() { printf '\\033[32m%s\\033[0m' "$*"; }
red()   { printf '\\033[31m%s\\033[0m' "$*"; }

fail() { printf '\\n  %s %s\\n\\n' "$(red "Error:")" "$1"; exit 1; }

CODE="\${1:-}"
if [ -z "$CODE" ]; then
  printf '\\n  %s\\n\\n' "$(bold "ClawPay Installer")"
  printf '  Usage: curl -fsSL https://clawpay.tech/install | bash -s -- <PAIRING_CODE>\\n\\n'
  exit 1
fi

printf '\\n  %s\\n\\n' "$(bold "ClawPay Installer")"

# ── Check prerequisites ─────────────────────────────────────────────────────
command -v curl    &>/dev/null || fail "'curl' is required but not installed."
command -v git     &>/dev/null || fail "'git' is required but not installed."
command -v openclaw &>/dev/null || fail "'openclaw' is not on your PATH. Install OpenClaw first: https://openclaw.com"

# ── Clone and run setup ─────────────────────────────────────────────────────
CLONE_DIR="$HOME/.openclaw/plugins/clawpay"

if [ ! -d "$CLONE_DIR/bin" ]; then
  printf '  Cloning ClawPay plugin ...\\n'
  rm -rf "$CLONE_DIR"
  mkdir -p "$CLONE_DIR"
  git clone --depth 1 https://github.com/addvinf/HackEurope.git "$CLONE_DIR/_repo" 2>/dev/null \\
    || fail "Could not clone the ClawPay repository."
  mv "$CLONE_DIR/_repo/clawpay/plugin/"* "$CLONE_DIR/" 2>/dev/null || true
  mv "$CLONE_DIR/_repo/clawpay/plugin/".* "$CLONE_DIR/" 2>/dev/null || true
  rm -rf "$CLONE_DIR/_repo"
fi

chmod +x "$CLONE_DIR/bin/setup.sh"
exec "$CLONE_DIR/bin/setup.sh" "$CODE"
`;

export async function GET(_request: NextRequest) {
  return new Response(INSTALL_SCRIPT, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache",
    },
  });
}
