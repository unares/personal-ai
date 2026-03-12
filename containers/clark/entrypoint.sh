#!/bin/sh
set -e

echo "[clark] Container started. Human: ${HUMAN_NAME:-unknown}, Entity: ${ENTITY:-unknown}"
echo "[clark] Vault mounts at /vault/. Claude CLI ready."
echo "[clark] Connect: docker exec -it \$(hostname) claude --dangerously-skip-permissions"

# Keep container alive for Claude CLI sessions
exec tail -f /dev/null
