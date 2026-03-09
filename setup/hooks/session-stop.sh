#!/bin/bash
# Personal AI — Session Stop Hook
# Syncs auto-memory and logs session end
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"

ENTITY="${ENTITY:-ai-workspace}"
HUMAN_NAME="${HUMAN_NAME:-unknown}"
ROLE="${ROLE:-technical}"

VAULT_PATH="${REPO_DIR}/memory-vault"
LOGS_DIR="${VAULT_PATH}/${ENTITY}/Logs"

# Final memory sync
if [ -f "$REPO_DIR/setup/sync-memory.sh" ]; then
  bash "$REPO_DIR/setup/sync-memory.sh" 2>/dev/null || true
fi

# Log session end
if [ -d "$LOGS_DIR" ]; then
  TS=$(date -u +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || date +"%Y-%m-%dT%H:%M:%SZ")
  echo "{\"ts\":\"$TS\",\"event\":\"session_stop\",\"human\":\"${HUMAN_NAME}\",\"entity\":\"${ENTITY}\",\"role\":\"${ROLE}\"}" \
    >> "$LOGS_DIR/sessions.jsonl" 2>/dev/null || true
fi
