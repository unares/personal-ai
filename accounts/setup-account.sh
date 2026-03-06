#!/bin/bash
# Personal AI — Setup a Claude Code Account
# Usage: ./setup-account.sh <account-id>
# Example: ./setup-account.sh michal-personal
set -euo pipefail

ACCOUNT_ID="${1:?Usage: setup-account.sh <account-id>}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
source "$REPO_DIR/version.sh"

ACCOUNTS_STORE="${ACCOUNTS_STORE:-$HOME/.config/personal-ai/claude-accounts}"
ACCOUNTS_JSON="$SCRIPT_DIR/accounts.json"

G="\033[32m" Y="\033[33m" C="\033[36m" B="\033[1m" D="\033[2m" R="\033[0m"
W=64
LINE=$(printf '═%.0s' $(seq 1 $W))

# Validate account exists in registry
if ! command -v node > /dev/null 2>&1; then
  printf "  ${Y}Error:${R} node is required.\n\n"
  exit 1
fi

ACCOUNT_DATA=$(node -e "
  const a = require('$ACCOUNTS_JSON');
  const acc = a.accounts.find(x => x.id === '$ACCOUNT_ID');
  if (!acc) {
    const ids = a.accounts.map(x => x.id).join(', ');
    console.error('Account not found: $ACCOUNT_ID. Available: ' + ids);
    process.exit(1);
  }
  console.log(JSON.stringify(acc));
" 2>&1) || { printf "  ${Y}Error:${R} ${ACCOUNT_DATA}\n\n"; exit 1; }

LABEL=$(node -e "console.log(${ACCOUNT_DATA}.label)")

printf "${B}${G}╔${LINE}\n"
printf "║  Personal AI v${VERSION} — Account Setup\n"
printf "║  Authenticating: ${LABEL}\n"
printf "╚${LINE}${R}\n\n"

# Create account store directory
mkdir -p "$ACCOUNTS_STORE/$ACCOUNT_ID"

# Check if already authenticated
if [ -f "$ACCOUNTS_STORE/$ACCOUNT_ID/.credentials.json" ]; then
  printf "  ${G}+${R} Account '${LABEL}' already has credentials.\n"
  read -rp "  Re-authenticate? [y/N]: " REAUTH
  if [ "${REAUTH,,}" != "y" ]; then
    printf "  ${D}Keeping existing credentials.${R}\n\n"
    exit 0
  fi
fi

# Backup current credentials if any
if [ -f "$HOME/.claude/.credentials.json" ]; then
  cp "$HOME/.claude/.credentials.json" "$HOME/.claude/.credentials.json.bak"
  printf "  ${D}Backed up current credentials.${R}\n"
fi

# Remove current credentials to force fresh OAuth
rm -f "$HOME/.claude/.credentials.json"

printf "  ${B}Launching Claude Code for OAuth...${R}\n"
printf "  ${D}A browser window will open. Log in with the ${LABEL} account.${R}\n"
printf "  ${D}After authenticating, type /exit to close Claude Code.${R}\n\n"

# Launch Claude Code to trigger OAuth
claude 2>/dev/null || true

# Check if new credentials were created
if [ -f "$HOME/.claude/.credentials.json" ]; then
  cp "$HOME/.claude/.credentials.json" "$ACCOUNTS_STORE/$ACCOUNT_ID/.credentials.json"
  printf "\n  ${G}+${R} Credentials saved for '${LABEL}'\n"
  printf "  ${D}Stored at: ${ACCOUNTS_STORE}/${ACCOUNT_ID}/.credentials.json${R}\n\n"
else
  printf "\n  ${Y}Warning:${R} No credentials found after OAuth. Try again.\n\n"
fi

# Restore backup if it existed
if [ -f "$HOME/.claude/.credentials.json.bak" ]; then
  mv "$HOME/.claude/.credentials.json.bak" "$HOME/.claude/.credentials.json"
  printf "  ${D}Restored previous credentials.${R}\n\n"
fi
