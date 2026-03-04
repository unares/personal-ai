#!/bin/bash
# Personal AI v0.2 — Clark Launcher
# Usage: ./clark.sh [person-name]
# Example: ./clark.sh michal
# If no name given, uses owner from config.json
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VAULT_PATH="$SCRIPT_DIR/memory-vault"
CONFIG_PATH="$SCRIPT_DIR/config.json"
IMAGE="personal-ai-clark"

G="\033[32m" Y="\033[33m" C="\033[36m" B="\033[1m" D="\033[2m" R="\033[0m"
W=64
LINE=$(printf '═%.0s' $(seq 1 $W))

banner() {
  printf "${B}${G}╔${LINE}\n"
  printf "║  Personal AI v0.2 — Clark\n"
  printf "║  Your Philosophical Brain\n"
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

# Resolve person name
if [ -n "${1:-}" ]; then
  PERSON=$(echo "$1" | tr '[:upper:]' '[:lower:]' | tr ' ' '-')
else
  PERSON=$(node -e "const c=require('${CONFIG_PATH}'); console.log(c.owner)")
fi

CLARK_NAME="clark-${PERSON}"

# Look up this clark in config
CLARK_DATA=$(node -e "
const c = require('${CONFIG_PATH}');
const cl = c.clarks.find(x => x.name === '${CLARK_NAME}');
if (!cl) { console.error('Clark not found: ${CLARK_NAME}'); process.exit(1); }
console.log(JSON.stringify(cl));
" 2>&1) || { printf "  ${Y}Error:${R} ${CLARK_NAME} not found in config.json.\n  Run ./install.sh or ./add-human.sh to register this person.\n\n"; exit 1; }

PROJECTS=$(node -e "const cl=${CLARK_DATA}; console.log(cl.projects.join(' '))")
AIOO_ACCESS=$(node -e "const cl=${CLARK_DATA}; console.log(cl.aioo_access ? 'true' : 'false')")

clear
banner
printf "  Clark:    ${B}${CLARK_NAME}${R}\n"
printf "  Entities: ${B}${PROJECTS}${R}\n"
[ "$AIOO_ACCESS" = "true" ] && printf "  Access:   Clark + AIOO\n" || printf "  Access:   Clark\n"
printf "\n"

# Check if already running
if docker ps --format '{{.Names}}' 2>/dev/null | grep -q "^${CLARK_NAME}$"; then
  printf "  ${G}✓${R} ${CLARK_NAME} is already running.\n"
  printf "  Attaching...\n\n"
  printf "  ${B}docker exec -it ${CLARK_NAME} claude${R}\n\n"
  exec docker exec -it "${CLARK_NAME}" claude
fi

# Build image if needed
if ! docker image inspect "$IMAGE" > /dev/null 2>&1; then
  printf "  Building Clark image (first time only, ~2 min)...\n"
  docker build -t "$IMAGE" "$SCRIPT_DIR/clark-image/" 2>&1 | grep -E "✔|Step|error" || true
  printf "\n"
fi

# Build mount args — one Distilled/Clark/ mount per entity
MOUNT_ARGS=""
for PROJ in $PROJECTS; do
  CLARK_DIR="$VAULT_PATH/$PROJ/Distilled/Clark"
  NS_FILE=$(find "$VAULT_PATH/$PROJ" -maxdepth 1 -name "*_NORTHSTAR.md" 2>/dev/null | head -1)
  mkdir -p "$CLARK_DIR"
  MOUNT_ARGS="$MOUNT_ARGS -v ${CLARK_DIR}:/vault/${PROJ}/Distilled/Clark:ro"
  [ -n "$NS_FILE" ] && MOUNT_ARGS="$MOUNT_ARGS -v ${NS_FILE}:/vault/${PROJ}/NORTHSTAR.md:ro"
  if [ "$AIOO_ACCESS" = "true" ]; then
    AIOO_DIR="$VAULT_PATH/$PROJ/Distilled/AIOO"
    mkdir -p "$AIOO_DIR"
    MOUNT_ARGS="$MOUNT_ARGS -v ${AIOO_DIR}:/vault/${PROJ}/Distilled/AIOO:ro"
  fi
done

# Launch
docker run -d --name "$CLARK_NAME" \
  $MOUNT_ARGS \
  -e "CLARK=${CLARK_NAME}" \
  -e "PERSON=${PERSON}" \
  "$IMAGE" > /dev/null

printf "  ${G}✓${R} ${CLARK_NAME} started\n"
for PROJ in $PROJECTS; do
  printf "  ${G}✓${R} ${PROJ}/Distilled/Clark/ mounted (read-only)\n"
  [ "$AIOO_ACCESS" = "true" ] && printf "  ${G}✓${R} ${PROJ}/Distilled/AIOO/ mounted (read-only)\n"
done

printf "${B}${G}╔${LINE}\n"
printf "║  ${CLARK_NAME} is ready.\n"
printf "╚${LINE}${R}\n\n"
printf "  Enter Clark:\n"
printf "  ${B}docker exec -it ${CLARK_NAME} claude${R}\n\n"
printf "  First prompt:\n"
printf "  ${D}\"Read /vault/. What is the One Thing?\"${R}\n\n"
printf "  Stop Clark:\n"
printf "  ${D}docker stop ${CLARK_NAME} && docker rm ${CLARK_NAME}${R}\n\n"
