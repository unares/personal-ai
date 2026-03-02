#!/bin/bash
# Personal AI v0.2 — AIOO Launcher
# Usage: ./aioo.sh <entity>
# Example: ./aioo.sh onething
set -euo pipefail

ENTITY="${1:?Usage: aioo.sh <entity>}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VAULT_PATH="$SCRIPT_DIR/chronicle-vault"
CONFIG_PATH="$SCRIPT_DIR/config.json"
IMAGE="personal-ai-aioo"
CONTAINER="aioo-${ENTITY}"

G="\033[32m" Y="\033[33m" C="\033[36m" B="\033[1m" D="\033[2m" R="\033[0m"
W=64
LINE=$(printf '═%.0s' $(seq 1 $W))

banner() {
  printf "${B}${G}╔${LINE}\n"
  printf "║  Personal AI v0.2 — AIOO\n"
  printf "║  AI Operating Officer\n"
  printf "╚${LINE}${R}\n\n"
}

if [ ! -f "$CONFIG_PATH" ]; then
  printf "  ${Y}Error:${R} config.json not found. Run ./install.sh first.\n\n"
  exit 1
fi

if ! command -v node > /dev/null 2>&1; then
  printf "  ${Y}Error:${R} node is required. Install Node.js.\n\n"
  exit 1
fi

# Validate entity exists in config
ENTITY_DATA=$(node -e "
const c = require('${CONFIG_PATH}');
const entities = c.entities || c.projects || [];
const e = entities.find(x => x.name === '${ENTITY}');
if (!e) {
  const names = entities.map(x => x.name).join(', ');
  console.error('Entity not found: ${ENTITY}. Available: ' + names);
  process.exit(1);
}
console.log(JSON.stringify(e));
" 2>&1) || { printf "  ${Y}Error:${R} ${ENTITY_DATA}\n\n"; exit 1; }

AIOO_NAME=$(node -e "const e=${ENTITY_DATA}; console.log(e.aioo)")
NS_FILE=$(node -e "const e=${ENTITY_DATA}; console.log(e.northstar)")

clear
banner
printf "  AIOO:     ${B}${CONTAINER}${R}\n"
printf "  Entity:   ${B}${ENTITY}${R}\n"
printf "  Northstar: ${B}${NS_FILE}${R}\n\n"

# Check if already running
if docker ps --format '{{.Names}}' 2>/dev/null | grep -q "^${CONTAINER}$"; then
  printf "  ${G}✓${R} ${CONTAINER} is already running.\n"
  printf "  Attaching...\n\n"
  exec docker exec -it "${CONTAINER}" claude
fi

# Validate vault exists
if [ ! -d "$VAULT_PATH/$ENTITY" ]; then
  printf "  ${Y}Error:${R} vault not found at chronicle-vault/${ENTITY}/\n"
  printf "  Run ./install.sh or ./add-entity.sh to create it.\n\n"
  exit 1
fi

# Build image if needed
if ! docker image inspect "$IMAGE" > /dev/null 2>&1; then
  printf "  Building AIOO image (first time only, ~2 min)...\n"
  docker build -t "$IMAGE" "$SCRIPT_DIR/aioo-image/" 2>&1 | grep -E "✔|Step|error" || true
  printf "\n"
fi

# Northstar path
NS_PATH=$(find "$VAULT_PATH/$ENTITY" -maxdepth 1 -name "*_NORTHSTAR.md" 2>/dev/null | head -1)
[ -z "$NS_PATH" ] && NS_PATH="$VAULT_PATH/$ENTITY/${NS_FILE}"

# Launch — full vault rw + NORTHSTAR at /vault/NORTHSTAR.md for easy access
docker run -d --name "$CONTAINER" \
  -v "$VAULT_PATH/$ENTITY:/vault" \
  -v "$NS_PATH:/vault/NORTHSTAR.md" \
  -v "$SCRIPT_DIR/ANNOUNCEMENTS.md:/ANNOUNCEMENTS.md:ro" \
  -e "ENTITY=${ENTITY}" \
  -e "AIOO=${CONTAINER}" \
  "$IMAGE" > /dev/null

printf "  ${G}✓${R} ${CONTAINER} started\n"
printf "  ${G}✓${R} chronicle-vault/${ENTITY}/ mounted (read-write)\n"
printf "  ${G}✓${R} NORTHSTAR.md at /vault/NORTHSTAR.md\n"
printf "  ${G}✓${R} ANNOUNCEMENTS.md mounted\n\n"

printf "${B}${G}╔${LINE}\n"
printf "║  ${CONTAINER} is ready.\n"
printf "╚${LINE}${R}\n\n"
printf "  Enter AIOO:\n"
printf "  ${B}docker exec -it ${CONTAINER} claude${R}\n\n"
printf "  First prompt:\n"
printf "  ${D}\"Read ANNOUNCEMENTS.md. Then read /vault/NORTHSTAR.md.\n"
printf "   Then read /vault/Distilled/. What needs to happen next?\"${R}\n\n"
printf "  Stop AIOO:\n"
printf "  ${D}docker stop ${CONTAINER} && docker rm ${CONTAINER}${R}\n\n"
