#!/bin/bash
# Personal AI — Sync Claude auto-memory to vault
# Called by participate.sh on launch and by PostToolUse hook on Write
# Usage: ./sync-memory.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

ENTITY="${ENTITY:-ai-workspace}"
HUMAN_NAME="${HUMAN_NAME:-michal}"

# Derive project hash: /Users/michalbrojak/personal-ai → -Users-michalbrojak-personal-ai
PROJECT_HASH="${REPO_DIR//\//-}"
MEMORY_SRC="$HOME/.claude/projects/${PROJECT_HASH}/memory/MEMORY.md"

[ -f "$MEMORY_SRC" ] || exit 0

DEST_DIR="$REPO_DIR/memory-vault/$ENTITY/Memories/Claude/$HUMAN_NAME"
mkdir -p "$DEST_DIR"

cp "$MEMORY_SRC" "$DEST_DIR/MEMORY.md"
