#!/bin/bash
# NanoClaw-PAW run wrapper.
# Restart-on-exit loop (Decision P6).
# Upgrade to launchd/systemd when ready.

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

# Export workspace root for PAW config
export PAW_WORKSPACE_ROOT="${SCRIPT_DIR}/../.."

echo "[nanoclaw-paw] Starting from ${SCRIPT_DIR}"
echo "[nanoclaw-paw] Workspace root: ${PAW_WORKSPACE_ROOT}"

while true; do
  echo "[nanoclaw-paw] $(date -Iseconds) — starting process"
  node dist/index.js || true
  EXIT_CODE=$?
  echo "[nanoclaw-paw] $(date -Iseconds) — process exited with code ${EXIT_CODE}"

  # Don't restart on clean shutdown (SIGTERM/SIGINT via trap)
  if [ "$EXIT_CODE" -eq 0 ]; then
    echo "[nanoclaw-paw] Clean exit, not restarting"
    break
  fi

  echo "[nanoclaw-paw] Restarting in 5 seconds..."
  sleep 5
done
