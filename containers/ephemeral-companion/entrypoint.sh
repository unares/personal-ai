#!/bin/sh
set -e

echo "[${ROLE:-companion}] Container started. Human: ${HUMAN_NAME:-unknown}, Entity: ${ENTITY:-unknown}"
echo "[${ROLE:-companion}] Vault mounts at /vault/. Claude CLI ready."
echo "[${ROLE:-companion}] Connect: docker exec -it $(hostname) claude --dangerously-skip-permissions"

# Keep container alive for Claude CLI sessions
exec tail -f /dev/null
