#!/bin/bash
# Personal AI — AIOO Launcher (NanoClaw)
# Usage: ./aioo.sh <entity> [--account <account-id>]
# Example: ./aioo.sh onething --account michal-personal
#
# AIOO runs NanoClaw as its orchestrator, with WhatsApp as primary channel.
# For interactive terminal: docker exec -it aioo-<entity> claude
set -euo pipefail

ENTITY="${1:?Usage: aioo.sh <entity> [--account <account-id>]}"
shift

# Parse optional flags
CLAUDE_ACCOUNT=""
while [ $# -gt 0 ]; do
  case "$1" in
    --account) CLAUDE_ACCOUNT="${2:?--account requires an account id}"; shift 2 ;;
    *) shift ;;
  esac
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
source "$REPO_DIR/version.sh"
VAULT_PATH="$REPO_DIR/memory-vault"
CONFIG_PATH="$REPO_DIR/config.json"
NANOCLAW_CONFIG="$REPO_DIR/nanoclaw-config"
IMAGE="personal-ai-aioo"
CONTAINER="aioo-${ENTITY}"
WHATSAPP_AUTH="$HOME/.config/personal-ai/whatsapp"
ACCOUNTS_STORE="${ACCOUNTS_STORE:-$HOME/.config/personal-ai/claude-accounts}"

G="\033[32m" Y="\033[33m" C="\033[36m" B="\033[1m" D="\033[2m" R="\033[0m"
W=64
LINE=$(printf '═%.0s' $(seq 1 $W))

banner() {
  printf "${B}${G}╔${LINE}\n"
  printf "║  Personal AI v${VERSION} — Companion AI Launch\n"
  printf "║  AI Operating Officer. Your Productivity Brain.\n"
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

NS_FILE=$(node -e "const e=${ENTITY_DATA}; console.log(e.northstar)")
HUMAN_LIST=$(node -e "const c=require('${CONFIG_PATH}'); const e=c.entities.find(x=>x.name==='${ENTITY}'); const h=[c.owner]; if(e&&e.human) h.push(e.human); console.log(h.join(', '))")

clear
banner
printf "  AIOO:         ${B}${CONTAINER}${R}\n"
printf "  Entity:       ${B}${ENTITY}${R}\n"
printf "  Northstar:    ${B}${NS_FILE}${R}\n"
printf "  Mode:         ${B}NanoClaw + WhatsApp${R}\n"
printf "  Reporting to: ${B}${HUMAN_LIST}${R}\n\n"

printf "  ${B}Capabilities:${R}\n"
printf "  ${C}1.${R} Spawning agents & agent teams\n"
printf "  ${C}2.${R} Running 24/7 efficiently\n"
printf "  ${C}3.${R} Building apps & launching fast\n"
printf "  ${C}4.${R} Data privacy & security\n"
printf "  ${C}5.${R} Supports you in building your One Thing\n\n"

# Check if already running
if docker ps --format '{{.Names}}' 2>/dev/null | grep -q "^${CONTAINER}$"; then
  printf "  ${G}✓${R} ${CONTAINER} is already running.\n"
  printf "  Attaching to interactive terminal...\n\n"
  exec docker exec -it "${CONTAINER}" claude
fi

# Validate vault exists
if [ ! -d "$VAULT_PATH/$ENTITY" ]; then
  printf "  ${Y}Error:${R} vault not found at memory-vault/${ENTITY}/\n"
  printf "  Run ./install.sh or ./add-entity.sh to create it.\n\n"
  exit 1
fi

# Build image if needed
if ! docker image inspect "$IMAGE" > /dev/null 2>&1; then
  printf "  Building AIOO image (first time only, ~3 min)...\n"
  docker build -t "$IMAGE" "$SCRIPT_DIR/" 2>&1 | grep -E "✔|Step|error" || true
  printf "\n"
fi

# Ensure Docker network exists
docker network create personal-ai-net 2>/dev/null || true

# Hydrate WELCOME.md (mktemp without .md suffix for macOS compat)
WELCOME_TMP=$(mktemp /tmp/welcome-XXXXXX)
sed -e "s/{ROLE}/AIOO/g" -e "s/{CONTAINER_NAME}/${CONTAINER}/g" -e "s/{ENTITY}/${ENTITY}/g" -e "s/{HUMAN_LIST}/${HUMAN_LIST}/g" "$REPO_DIR/memory-vault/AGENT_WELCOME.md" > "$WELCOME_TMP"

# Load environment
[ -f "$REPO_DIR/.env" ] && set -a && source "$REPO_DIR/.env" && set +a

# Build mount arguments
# NOTE: No separate NORTHSTAR.md mount — it's already in /vault/ via the directory mount.
# Docker Desktop Mac (virtiofs) cannot mount a file inside an already-mounted directory.
# AIOO finds *_NORTHSTAR.md dynamically in /vault/.
MOUNTS=(
  -v "$VAULT_PATH/$ENTITY:/vault"
  -v "$WELCOME_TMP:/WELCOME.md:ro"
)

# NanoClaw config overlays
if [ -d "$NANOCLAW_CONFIG/aioo" ]; then
  MOUNTS+=(
    -v "$NANOCLAW_CONFIG/aioo/CLAUDE.md:/opt/nanoclaw/groups/main/CLAUDE.md:ro"
  )
fi
if [ -d "$NANOCLAW_CONFIG/aioo/skills" ]; then
  MOUNTS+=(-v "$NANOCLAW_CONFIG/aioo/skills:/opt/nanoclaw/.claude/skills/aioo:ro")
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

# Docker socket (restricted — for container management)
if [ -S /var/run/docker.sock ]; then
  MOUNTS+=(-v "/var/run/docker.sock:/var/run/docker.sock")
  printf "  ${G}✓${R} Docker socket mounted (for container management)\n"
fi

# Claude accounts (persistent OAuth)
if [ -d "$ACCOUNTS_STORE" ]; then
  MOUNTS+=(-v "$ACCOUNTS_STORE:/home/pai/.claude-accounts:ro")
  printf "  ${G}✓${R} Claude accounts mounted\n"
fi

# Interactive account selection if not pre-selected
if [ -z "$CLAUDE_ACCOUNT" ] && [ -f "$REPO_DIR/accounts/select-account.sh" ]; then
  export HUMAN_NAME="${HUMAN_NAME:-$(git config user.name 2>/dev/null || whoami)}"
  source "$REPO_DIR/accounts/select-account.sh"
  select_account "$HOME/.claude"
  printf "\n"
fi

# If account selected, pre-copy credentials into a temp dir to mount
if [ -n "$CLAUDE_ACCOUNT" ] && [ -f "$ACCOUNTS_STORE/$CLAUDE_ACCOUNT/.credentials.json" ]; then
  CLAUDE_CREDS_TMP=$(mktemp -d /tmp/claude-creds-XXXXXX)
  cp "$ACCOUNTS_STORE/$CLAUDE_ACCOUNT/.credentials.json" "$CLAUDE_CREDS_TMP/.credentials.json"
  MOUNTS+=(-v "$CLAUDE_CREDS_TMP/.credentials.json:/home/pai/.claude/.credentials.json:ro")
  printf "  ${G}✓${R} Account credentials: ${CLAUDE_ACCOUNT}\n"
fi

# Environment variables
ENV_ARGS=(
  -e "ENTITY=${ENTITY}"
  -e "AIOO=${CONTAINER}"
  -e "ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY:-}"
  -e "CLAUDE_ACCOUNT=${CLAUDE_ACCOUNT:-}"
  -e "HUMAN_NAME=${HUMAN_NAME:-$(git config user.name 2>/dev/null || whoami)}"
)

# LiteLLM hybrid routing (optional)
if [ "${HYBRID_ENABLED:-false}" = "true" ] && [ -n "${LITELLM_BASE_URL:-}" ]; then
  ENV_ARGS+=(
    -e "ANTHROPIC_BASE_URL=${LITELLM_BASE_URL}"
    -e "GEMINI_API_KEY=${GEMINI_API_KEY:-}"
    -e "HYBRID_ENABLED=true"
    -e "LITELLM_BASE_URL=${LITELLM_BASE_URL}"
  )
  printf "  ${G}✓${R} Hybrid routing enabled (Gemini + Claude via LiteLLM)\n"
else
  printf "  ${D}ℹ${R} Hybrid routing disabled (Claude only)\n"
fi

# Launch AIOO with NanoClaw
docker run -d --name "$CONTAINER" \
  --hostname "$CONTAINER" \
  --network personal-ai-net \
  "${MOUNTS[@]}" \
  "${ENV_ARGS[@]}" \
  "$IMAGE" > /dev/null

printf "\n"
printf "  ${G}✓${R} ${CONTAINER} started (NanoClaw orchestrator)\n"
printf "  ${G}✓${R} memory-vault/${ENTITY}/ mounted (read-write)\n"
printf "  ${G}✓${R} Northstar at /vault/${NS_FILE}\n"
printf "  ${G}✓${R} Connected to personal-ai-net\n"

printf "\n${B}${G}╔${LINE}\n"
printf "║  ${CONTAINER} is ready.\n"
printf "║  Do these things next:\n"
printf "╚${LINE}${R}\n\n"

printf "  ${B}1. Start a Claude Code session:${R}\n"
printf "     ${G}docker exec -it ${CONTAINER} claude${R}\n\n"
printf "     First prompt inside Claude Code:\n"
printf "     ${D}\"Read /WELCOME.md. Then read /vault/${NS_FILE}.\n"
printf "      Then read /vault/Distilled/. What needs to happen next?\"${R}\n\n"

printf "  ${B}2. Stop this Companion AI:${R}\n"
printf "     ${D}docker stop ${CONTAINER} && docker rm ${CONTAINER}${R}\n\n"

printf "  ${B}3. View Companion AI logs:${R}\n"
printf "     ${D}docker logs -f ${CONTAINER}${R}\n"
printf "     ${D}memory-vault/${ENTITY}/Logs/${R}\n\n"
