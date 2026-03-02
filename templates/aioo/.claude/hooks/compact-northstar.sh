#!/bin/bash
# AIOO PostToolUse hook: when NORTHSTAR.md is written, propagate summary to shared/
# Reads tool_input JSON from stdin
set -euo pipefail

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | grep -o '"file_path"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/.*"file_path"[[:space:]]*:[[:space:]]*"//;s/"$//')

# Only trigger on NORTHSTAR.md writes
[[ "$FILE_PATH" == *"NORTHSTAR.md" ]] || exit 0

PROJECT_ID="${PROJECT_ID:-personal-ai}"
SUMMARY_DIR="${SUMMARY_DIR:-/app/shared/northstar-summaries}"

mkdir -p "$SUMMARY_DIR"
cp "$FILE_PATH" "$SUMMARY_DIR/$PROJECT_ID.md"
echo "→ Northstar summary propagated: $SUMMARY_DIR/$PROJECT_ID.md"
