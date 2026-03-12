#!/bin/bash
# init-ipc.sh — Create IPC and config directory tree
# Idempotent: safe to run multiple times
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

echo "[init-ipc] Creating IPC directories..."

for entity in procenteo inisio; do
  for channel in to-paw from-paw; do
    dir="$PROJECT_ROOT/ipc/aioo-${entity}/${channel}/processed"
    mkdir -p "$dir"
    echo "  Created: ipc/aioo-${entity}/${channel}/"
  done
done

# Watchdog channels
for channel in pings pongs to-paw; do
  mkdir -p "$PROJECT_ROOT/ipc/watchdog/${channel}/processed"
  echo "  Created: ipc/watchdog/${channel}/"
done

echo "[init-ipc] Creating config directories..."

for entity in procenteo inisio; do
  mkdir -p "$PROJECT_ROOT/config/ai-gateway-${entity}"
  echo "  Created: config/ai-gateway-${entity}/"
done

echo "[init-ipc] Creating AIOO config files..."

for entity in procenteo inisio; do
  config_file="$PROJECT_ROOT/config/aioo-${entity}.json"
  if [ ! -f "$config_file" ]; then
    cat > "$config_file" <<'CONF'
{
  "pollIntervalMs": 1000,
  "healthIntervalMs": 15000
}
CONF
    echo "  Created: config/aioo-${entity}.json"
  else
    echo "  Exists:  config/aioo-${entity}.json"
  fi
done

echo "[init-ipc] Done."
