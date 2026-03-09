#!/bin/bash
# Personal AI — Session Start Hook
# Logs session start and checks context sync staleness
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"

ENTITY="${ENTITY:-ai-workspace}"
HUMAN_NAME="${HUMAN_NAME:-unknown}"
ROLE="${ROLE:-technical}"

VAULT_PATH="${REPO_DIR}/memory-vault"
LOGS_DIR="${VAULT_PATH}/${ENTITY}/Logs"

# Log session start
if [ -d "$LOGS_DIR" ]; then
  TS=$(date -u +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || date +"%Y-%m-%dT%H:%M:%SZ")
  echo "{\"ts\":\"$TS\",\"event\":\"session_start\",\"human\":\"${HUMAN_NAME}\",\"entity\":\"${ENTITY}\",\"role\":\"${ROLE}\"}" \
    >> "$LOGS_DIR/sessions.jsonl" 2>/dev/null || true
fi

# Check context sync staleness
SYNC_STATE="${LOGS_DIR}/.context-sync-last"
if [ -f "$SYNC_STATE" ]; then
  LAST_TS=$(cat "$SYNC_STATE" 2>/dev/null)
  if [ -n "$LAST_TS" ]; then
    NOW=$(date +%s 2>/dev/null) || exit 0
    LAST=$(date -j -f "%Y-%m-%dT%H:%M:%SZ" "$LAST_TS" +%s 2>/dev/null || date -d "$LAST_TS" +%s 2>/dev/null) || exit 0
    AGE_H=$(( (NOW - LAST) / 3600 ))
    [ "$AGE_H" -ge 24 ] && echo "Context last synced ${AGE_H}h ago. Run: setup/context-sync.sh --sync ${ENTITY}"
  fi
fi
