#!/bin/bash
# Install Host Watchdog — sets up cron, config directory, log directory.
# Idempotent: safe to run multiple times.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
WATCHDOG_SCRIPT="${SCRIPT_DIR}/watchdog.sh"
LOG_FILE="${PROJECT_ROOT}/logs/watchdog.log"

echo "[watchdog-install] Setting up Host Watchdog..."

# 1. Ensure watchdog.sh is executable
chmod +x "$WATCHDOG_SCRIPT"
echo "  Executable: watchdog.sh"

# 2. Create ~/.watchdog/ with config template
WATCHDOG_DIR="${HOME}/.watchdog"
mkdir -p "$WATCHDOG_DIR"

if [ ! -f "${WATCHDOG_DIR}/config.json" ]; then
  cp "${SCRIPT_DIR}/config-template.json" "${WATCHDOG_DIR}/config.json"
  echo "  Created: ~/.watchdog/config.json (edit with your settings)"
else
  echo "  Exists:  ~/.watchdog/config.json"
fi

if [ ! -f "${WATCHDOG_DIR}/emergency-api-key" ]; then
  echo "YOUR_TELEGRAM_BOT_TOKEN_HERE" > "${WATCHDOG_DIR}/emergency-api-key"
  chmod 600 "${WATCHDOG_DIR}/emergency-api-key"
  echo "  Created: ~/.watchdog/emergency-api-key (replace with real token)"
else
  echo "  Exists:  ~/.watchdog/emergency-api-key"
fi

# 3. Create IPC directory for watchdog → PAW notifications
mkdir -p "${PROJECT_ROOT}/ipc/watchdog/to-paw/processed"
echo "  Created: ipc/watchdog/to-paw/"

# 4. Create log directory
mkdir -p "$(dirname "$LOG_FILE")"
echo "  Created: logs/"

# 5. Set up cron job (every 60 seconds)
CRON_CMD="* * * * * ${WATCHDOG_SCRIPT} >> ${LOG_FILE} 2>&1"
CRON_MARKER="# host-watchdog"

if crontab -l 2>/dev/null | grep -q "$CRON_MARKER"; then
  echo "  Cron:    already installed"
else
  (crontab -l 2>/dev/null || true; echo "${CRON_CMD} ${CRON_MARKER}") | crontab -
  echo "  Cron:    installed (every 60s)"
fi

echo ""
echo "[watchdog-install] Done."
echo ""
echo "Next steps:"
echo "  1. Edit ~/.watchdog/config.json with your Telegram settings"
echo "  2. Replace ~/.watchdog/emergency-api-key with your bot token"
echo "  3. Verify: crontab -l | grep watchdog"
