#!/bin/bash

# solana-payments-skill — remote bootstrap installer
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/skyyycodes/solana-payments-skill/main/setup.sh | bash
#
# This script clones the repo into a temp dir and runs install.sh.
# Optional env vars:
#   REPO_URL   override the git URL to clone
#   REF        branch/tag/commit to install (default: main)
#   INSTALLER  which installer to run (default: install.sh)

set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/skyyycodes/solana-payments-skill.git}"
REF="${REF:-main}"
INSTALLER="${INSTALLER:-install.sh}"

GREEN='\033[0;32m'; CYAN='\033[0;36m'; RED='\033[0;31m'; NC='\033[0m'

echo -e "${CYAN}Installing solana-payments-skill...${NC}"

if ! command -v git >/dev/null 2>&1; then
  echo -e "${RED}Error: git is required but not installed.${NC}" >&2
  exit 1
fi

TMP_DIR="$(mktemp -d)"
cleanup() { rm -rf "$TMP_DIR"; }
trap cleanup EXIT

git clone --depth 1 --branch "$REF" "$REPO_URL" "$TMP_DIR/solana-payments-skill" >/dev/null 2>&1 \
  || git clone --depth 1 "$REPO_URL" "$TMP_DIR/solana-payments-skill" >/dev/null 2>&1

cd "$TMP_DIR/solana-payments-skill"
chmod +x "$INSTALLER"

# Pass -y for non-interactive when piped through bash (no TTY)
if [ -t 0 ]; then
  "./$INSTALLER" "$@"
else
  "./$INSTALLER" -y "$@"
fi

echo -e "${GREEN}Done.${NC}"

