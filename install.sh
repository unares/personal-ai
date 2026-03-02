#!/bin/bash
# Personal AI v0.2 — Seed Bootstrap
# Usage: ./install.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VAULT_PATH="$SCRIPT_DIR/chronicle-vault"

echo "Personal AI v0.2 — Seed MVP Bootstrap"
echo "======================================"

# Create vault directory structure
echo "Creating chronicle-vault..."
mkdir -p "$VAULT_PATH/Raw/Daily"
mkdir -p "$VAULT_PATH/Raw/Projects"
mkdir -p "$VAULT_PATH/Raw/People"
mkdir -p "$VAULT_PATH/Distilled/Clark"
mkdir -p "$VAULT_PATH/Distilled/AIOO"
mkdir -p "$VAULT_PATH/Archive/Raw"
mkdir -p "$VAULT_PATH/Logs"
mkdir -p "$VAULT_PATH/MINI_NORTHSTAR"

# Seed NORTHSTAR.md (only if not exists)
if [ ! -f "$VAULT_PATH/NORTHSTAR.md" ]; then
  printf '# NORTHSTAR\n\nDo One Thing. Earn Full Autonomy.\n\nEdit this file to define your long-term vision.\n' > "$VAULT_PATH/NORTHSTAR.md"
  echo "  Seeded NORTHSTAR.md"
fi

echo "  Vault ready at: $VAULT_PATH"

# Start Content Loader
echo "Starting Content Loader..."
cd "$SCRIPT_DIR"
docker compose --profile seed up -d --build content-loader

echo ""
echo "Seed MVP ready."
echo "  Vault: $VAULT_PATH"
echo "  Content Loader: running (docker compose --profile seed logs content-loader)"
echo "  Next: drop .md files into $VAULT_PATH/Raw/ and watch Distilled/ populate"
echo "  Spawn builder: ./mvp-builder.sh <project> <name>"
