#!/bin/sh
set -e

echo "[app-dev-stage] Container started. Entity: ${ENTITY:-unknown}, App: ${APP:-unknown}, Stage: ${STAGE:-unknown}"
echo "[app-dev-stage] Vault at /vault (read context). Workspace at /workspace (write code)."
echo "[app-dev-stage] Agents enter via: docker exec ${HOSTNAME} claude ..."

# Health heartbeat — checked by compose healthcheck
touch /tmp/alive

# Keep container alive for agent sessions
exec tail -f /dev/null
