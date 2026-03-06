#!/bin/sh
set -e

# Fix ownership of volume mounts (runs as root via su-exec)
chown -R pai:pai /vault /workspace /home/pai/.claude 2>/dev/null || true

# Try NanoClaw if it's been built
if [ -f /opt/nanoclaw/dist/index.js ]; then
  echo "[entrypoint] Attempting to start NanoClaw..."
  if su-exec pai node /opt/nanoclaw/dist/index.js 2>&1; then
    exit 0
  fi
  EXIT_CODE=$?
  echo "[entrypoint] NanoClaw exited ($EXIT_CODE)."
  echo ""
fi

# Fallback: keep container alive for direct Claude Code access
echo "╔════════════════════════════════════════════════════════════════"
echo "║  AIOO Container — Fallback Mode"
echo "║  NanoClaw not available (WhatsApp auth missing or build error)."
echo "║"
echo "║  Connect with Claude Code:"
echo "║    docker exec -it -u pai $(hostname) pai-launch"
echo "║"
echo "║  Or directly:"
echo "║    docker exec -it -u pai $(hostname) claude --dangerously-skip-permissions"
echo "╚════════════════════════════════════════════════════════════════"
echo ""
echo "[entrypoint] Container alive. Waiting for connections..."

# Keep alive
exec tail -f /dev/null
