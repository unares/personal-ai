#!/bin/bash
# Personal AI — Session Stop Hook
# Syncs auto-memory and logs session end
# Errors are logged to Logs/hook-errors.log instead of silenced

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"

ENTITY="${ENTITY:-ai-workspace}"
HUMAN_NAME="${HUMAN_NAME:-unknown}"
ROLE="${ROLE:-technical}"

VAULT_PATH="${REPO_DIR}/memory-vault"
LOGS_DIR="${VAULT_PATH}/${ENTITY}/Logs"
ERROR_LOG="${LOGS_DIR}/hook-errors.log"

_log_error() {
  local msg="$1"
  local ts; ts=$(date -u +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || echo "unknown")
  if [ -d "$LOGS_DIR" ]; then
    echo "${ts} [session-stop] ERROR: ${msg}" >> "$ERROR_LOG" || true
  fi
}

# Final memory sync
if [ -f "$REPO_DIR/setup/sync-memory.sh" ]; then
  bash "$REPO_DIR/setup/sync-memory.sh" 2>>"$ERROR_LOG" \
    || _log_error "sync-memory.sh exited non-zero"
else
  _log_error "sync-memory.sh not found at ${REPO_DIR}/setup/sync-memory.sh"
fi

# Log session end
if [ -d "$LOGS_DIR" ]; then
  TS=$(date -u +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || date +"%Y-%m-%dT%H:%M:%SZ")
  echo "{\"ts\":\"$TS\",\"event\":\"session_stop\",\"human\":\"${HUMAN_NAME}\",\"entity\":\"${ENTITY}\",\"role\":\"${ROLE}\"}" \
    >> "$LOGS_DIR/sessions.jsonl" || _log_error "Failed to write session_stop to sessions.jsonl"
else
  _log_error "Logs dir not found: ${LOGS_DIR}"
fi
