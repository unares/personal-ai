#!/bin/bash
# Personal AI v0.2 — MVP Builder Launcher
# Usage: ./mvp-builder.sh <project> <name>
# Example: ./mvp-builder.sh personal-ai my-feature
set -euo pipefail

PROJECT="${1:?Usage: mvp-builder.sh <project> <name>}"
NAME="${2:?Usage: mvp-builder.sh <project> <name>}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VAULT_PATH="$SCRIPT_DIR/chronicle-vault"
CONTAINER="mvp-${PROJECT}-${NAME}"

# Read NORTHSTAR
NORTHSTAR="(no NORTHSTAR.md found)"
if [ -f "$VAULT_PATH/NORTHSTAR.md" ]; then
  NORTHSTAR=$(cat "$VAULT_PATH/NORTHSTAR.md")
fi

# Write CLAUDE.md to a temp file (avoids env var size limits)
TMPFILE=$(mktemp)
cat > "$TMPFILE" <<CLAUDEEOF
# MVP Builder: ${NAME} (project: ${PROJECT})

## NORTHSTAR
${NORTHSTAR}

## Rules
- Do One Thing. Ship fast. No bloat.
- Read-only access to Distilled/ context.
- All output logged to /vault/Logs/${CONTAINER}.log
- Functions < 30 lines. Files < 300 lines.
CLAUDEEOF

echo "Launching MVP Builder: ${CONTAINER}"
docker run -d --name "${CONTAINER}" \
  -v "$VAULT_PATH/Distilled:/vault/Distilled:ro" \
  -v "$VAULT_PATH/Logs:/vault/Logs" \
  -v "$TMPFILE:/app/CLAUDE.md:ro" \
  node:20-alpine sleep infinity

echo "Builder running: ${CONTAINER}"
echo "  Context: Distilled/ (read-only)"
echo "  Logs: $VAULT_PATH/Logs/"
echo "  Attach: docker exec -it ${CONTAINER} sh"
echo "  Stop:   docker stop ${CONTAINER} && docker rm ${CONTAINER}"
