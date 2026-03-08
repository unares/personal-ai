#!/bin/bash
# Personal AI — Clark Launcher (NanoClaw)
# Usage: ./clark.sh [person-name]
# Example: ./clark.sh michal
# If no name given, uses owner from config.json
#
# Clark runs NanoClaw as its orchestrator, with WhatsApp as primary channel.
# For interactive terminal: docker exec -it clark-<person> claude
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
source "$REPO_DIR/version.sh"
VAULT_PATH="$REPO_DIR/memory-vault"
CONFIG_PATH="$REPO_DIR/config.json"
NANOCLAW_CONFIG="$REPO_DIR/nanoclaw-config"
IMAGE="personal-ai-clark"
WHATSAPP_AUTH="$HOME/.config/personal-ai/whatsapp"
ACCOUNTS_STORE="${ACCOUNTS_STORE:-$HOME/.config/personal-ai/claude-accounts}"

G="\033[32m" Y="\033[33m" C="\033[36m" B="\033[1m" D="\033[2m" R="\033[0m"
W=64
LINE=$(printf '═%.0s' $(seq 1 $W))

banner() {
  printf "${B}${G}╔${LINE}\n"
  printf "║  Personal AI v${VERSION} — Clark (NanoClaw)\n"
  printf "║  Clarity Architect\n"
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
printf "  Mode:     ${B}NanoClaw + WhatsApp${R}\n"
[ "$AIOO_ACCESS" = "true" ] && printf "  Access:   Clark + AIOO\n" || printf "  Access:   Clark\n"
printf "\n"

# Check if already running
if docker ps --format '{{.Names}}' 2>/dev/null | grep -q "^${CLARK_NAME}$"; then
  printf "  ${G}✓${R} ${CLARK_NAME} is already running.\n"
  printf "  Attaching to interactive terminal...\n\n"
  exec docker exec -it "${CLARK_NAME}" claude
fi

# Build image if needed
if ! docker image inspect "$IMAGE" > /dev/null 2>&1; then
  printf "  Building Clark image (first time only, ~3 min)...\n"
  docker build -t "$IMAGE" "$SCRIPT_DIR/" 2>&1 | grep -E "✔|Step|error" || true
  printf "\n"
fi

# Ensure Docker network exists
docker network create personal-ai-net 2>/dev/null || true

# Hydrate WELCOME.md
WELCOME_TMP=$(mktemp /tmp/welcome-XXXXXX)
HUMAN_LIST=$(node -e "const c=require('${CONFIG_PATH}'); console.log(c.clarks.filter(x=>x.projects).map(x=>x.name.replace('clark-','')).join(', '))")
sed -e "s/{ROLE}/Clark/g" -e "s/{CONTAINER_NAME}/${CLARK_NAME}/g" -e "s/{ENTITY}/${PROJECTS}/g" -e "s/{HUMAN_LIST}/${HUMAN_LIST}/g" "$REPO_DIR/memory-vault/AGENT_WELCOME.md" > "$WELCOME_TMP"

# Build mount args — read-only Distilled/ per entity
MOUNTS=(
  -v "${WELCOME_TMP}:/WELCOME.md:ro"
)

for PROJ in $PROJECTS; do
  CLARK_DIR="$VAULT_PATH/$PROJ/Distilled/Clark"
  NS_FILE=$(find "$VAULT_PATH/$PROJ" -maxdepth 1 -name "*_NORTHSTAR.md" 2>/dev/null | head -1)
  mkdir -p "$CLARK_DIR"
  MOUNTS+=(-v "${CLARK_DIR}:/vault/${PROJ}/Distilled/Clark:ro")
  [ -n "$NS_FILE" ] && MOUNTS+=(-v "${NS_FILE}:/vault/${PROJ}/NORTHSTAR.md:ro")
  if [ "$AIOO_ACCESS" = "true" ]; then
    AIOO_DIR="$VAULT_PATH/$PROJ/Distilled/AIOO"
    mkdir -p "$AIOO_DIR"
    MOUNTS+=(-v "${AIOO_DIR}:/vault/${PROJ}/Distilled/AIOO:ro")
  fi
done

# NanoClaw config overlays
if [ -d "$NANOCLAW_CONFIG/clark" ]; then
  MOUNTS+=(-v "$NANOCLAW_CONFIG/clark/CLAUDE.md:/opt/nanoclaw/groups/main/CLAUDE.md:ro")
fi
if [ -d "$NANOCLAW_CONFIG/skills" ]; then
  MOUNTS+=(-v "$NANOCLAW_CONFIG/skills:/opt/nanoclaw/.claude/skills/shared:ro")
fi

# WhatsApp auth (persistent across rebuilds)
if [ -d "$WHATSAPP_AUTH" ]; then
  MOUNTS+=(-v "$WHATSAPP_AUTH:/opt/nanoclaw/data/whatsapp")
  printf "  ${G}✓${R} WhatsApp auth mounted\n"
else
  printf "  ${D}ℹ${R} No WhatsApp auth found. Run setup/setup-whatsapp.sh to enable.\n"
fi

# Claude accounts (persistent OAuth)
if [ -d "$ACCOUNTS_STORE" ]; then
  MOUNTS+=(-v "$ACCOUNTS_STORE:/home/pai/.claude-accounts:ro")
  printf "  ${G}✓${R} Claude accounts mounted\n"
fi

# Interactive account selection
CLAUDE_ACCOUNT=""
if [ -f "$REPO_DIR/accounts/select-account.sh" ]; then
  export HUMAN_NAME="${HUMAN_NAME:-$(git config user.name 2>/dev/null || whoami)}"
  source "$REPO_DIR/accounts/select-account.sh"
  select_account "$HOME/.claude"
  printf "\n"
fi

# Pre-copy credentials if account selected
if [ -n "$CLAUDE_ACCOUNT" ] && [ -f "$ACCOUNTS_STORE/$CLAUDE_ACCOUNT/.credentials.json" ]; then
  CLAUDE_CREDS_TMP=$(mktemp -d /tmp/claude-creds-XXXXXX)
  cp "$ACCOUNTS_STORE/$CLAUDE_ACCOUNT/.credentials.json" "$CLAUDE_CREDS_TMP/.credentials.json"
  MOUNTS+=(-v "$CLAUDE_CREDS_TMP/.credentials.json:/home/pai/.claude/.credentials.json:ro")
  printf "  ${G}✓${R} Account credentials: ${CLAUDE_ACCOUNT}\n"
fi

# Load environment
[ -f "$REPO_DIR/.env" ] && set -a && source "$REPO_DIR/.env" && set +a

# Environment variables
ENV_ARGS=(
  -e "CLARK=${CLARK_NAME}"
  -e "PERSON=${PERSON}"
  -e "ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY:-}"
  -e "CLAUDE_ACCOUNT=${CLAUDE_ACCOUNT:-}"
  -e "HUMAN_NAME=${HUMAN_NAME:-$(git config user.name 2>/dev/null || whoami)}"
)

# NOTE: Clark stays on Claude for now (no hybrid routing). Gemini decision deferred.

# Launch Clark with NanoClaw — NO Docker socket (cannot spawn containers)
docker run -d --name "$CLARK_NAME" \
  --hostname "$CLARK_NAME" \
  --network personal-ai-net \
  "${MOUNTS[@]}" \
  "${ENV_ARGS[@]}" \
  "$IMAGE" > /dev/null

printf "\n"
printf "  ${G}✓${R} ${CLARK_NAME} started (NanoClaw orchestrator)\n"
for PROJ in $PROJECTS; do
  printf "  ${G}✓${R} ${PROJ}/Distilled/Clark/ mounted (read-only)\n"
  [ "$AIOO_ACCESS" = "true" ] && printf "  ${G}✓${R} ${PROJ}/Distilled/AIOO/ mounted (read-only)\n"
done
printf "  ${G}✓${R} Connected to personal-ai-net\n"

printf "\n${B}${G}╔${LINE}\n"
printf "║  ${CLARK_NAME} is ready.\n"
printf "╚${LINE}${R}\n\n"

printf "  Interactive terminal:\n"
printf "  ${B}docker exec -it ${CLARK_NAME} claude${R}\n\n"
printf "  View NanoClaw logs:\n"
printf "  ${D}docker logs -f ${CLARK_NAME}${R}\n\n"
printf "  First prompt:\n"
printf "  ${D}\"Read /WELCOME.md. Then read /vault/. What is the One Thing?\"${R}\n\n"
printf "  Stop Clark:\n"
printf "  ${D}docker stop ${CLARK_NAME} && docker rm ${CLARK_NAME}${R}\n\n"
