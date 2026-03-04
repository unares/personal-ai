#!/bin/bash
# Personal AI v0.4 — Guided Setup Wizard
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
VAULT_PATH="$REPO_DIR/memory-vault"
CONFIG_PATH="$REPO_DIR/config.json"

G="\033[32m" Y="\033[33m" C="\033[36m" B="\033[1m" D="\033[2m" R="\033[0m"
W=64
LINE=$(printf '═%.0s' $(seq 1 $W))

step_banner() {
  local step=$1 total=$2 title="$3"
  local filled=$((step >= total ? 16 : step * 16 / total)) empty=$((16 - filled))
  local bar="" i
  for i in $(seq 1 $filled); do bar="${bar}█"; done
  for i in $(seq 1 $empty); do bar="${bar}░"; done
  shift 3
  printf "${B}${G}╔${LINE}\n"
  printf "║  [Step %s/%s]  %s  %s\n" "$step" "$total" "$bar" "$title"
  printf "╠${LINE}\n"
  while [ $# -gt 0 ]; do
    printf "║  ${C}▸${G} %s\n" "$1"
    shift
  done
  printf "╚${LINE}${R}\n\n"
}

upper() { echo "$1" | tr '[:lower:]' '[:upper:]'; }
lower() { echo "$1" | tr '[:upper:]' '[:lower:]' | tr ' ' '-'; }

confirm() {
  while true; do
    printf "  ${D}You entered:${R} ${B}${2}${R}\n"
    read -rp "  Confirm? [y/n]: " YN
    case "$YN" in y*|Y*) return 0;; n*|N*) return 1;; esac
  done
}

ask_raw() {
  local _var="$1" _prompt="$2" _val=""
  while true; do
    read -rp "  ${_prompt}: " _val
    if confirm "$_prompt" "$_val"; then
      eval "$_var='$_val'"
      return
    fi
    printf "  ${Y}Let's try again.${R}\n"
  done
}

clear
printf "${B}${G}╔${LINE}\n"
printf "║  Personal AI v0.4 — Setup Wizard\n"
printf "║  Do One Thing. Earn Full Autonomy.\n"
printf "╚${LINE}${R}\n"
printf "\n  ${D}4 steps · ~2 minutes${R}\n\n"

# ── Step 1: Owner ──────────────────────────────────────────────────────────
step_banner 1 4 "Your Identity" \
  "Clark  = Clarity Architect, your Philosophical Brain" \
  "Entity = a company or major project (brand name)" \
  "AIOO   = AI Operating Officer, your Productivity Brain"

ask_raw OWNER_RAW "Your first name"
OWNER_NAME=$(lower "$OWNER_RAW")
OWNER_CLARK="clark-${OWNER_NAME}"

printf "\n  ${G}✓${R} ${B}${OWNER_CLARK}${R} created.\n"
printf "  ${D}You are the Personal AI super-user — your Clark has\n"
printf "  read access to all entity vaults. Humans you add to\n"
printf "  an entity will only see that entity.${R}\n\n"

# ── Step 2: Entities ────────────────────────────────────────────────────────
step_banner 2 4 "Your Entities" \
  "Human    = another person jointly responsible for an entity" \
  "Northstar = your locked long-term vision, read by all agents" \
  "Vault     = your private, isolated, memory layer"

ENTITIES_JSON=""
ENTITIES_ARRAY=""
ENTITY_NAMES=()
HUMAN_CLARKS=()
ENTITY_COUNT=0

while true; do
  ENTITY_COUNT=$((ENTITY_COUNT + 1))
  printf "  ${B}── Entity #${ENTITY_COUNT} ──────────────────────────────────────${R}\n"

  ask_raw PROJ_RAW "Entity name"
  PROJ_NAME=$(lower "$PROJ_RAW")
  NS_FILE="$(upper "$PROJ_NAME")_NORTHSTAR.md"
  AIOO_NAME="aioo-${PROJ_NAME}"

  printf "\n"
  while true; do
    printf "  Is ${B}${PROJ_NAME}${R} a solo project/company? [y/n]: "
    read -r IS_SOLO
    case "$IS_SOLO" in y*|Y*|n*|N*) break;; esac
    printf "  ${Y}Please enter y or n.${R}\n"
  done

  HUMAN_NAME="null"
  HUMAN_CLARK_NAME="null"
  HUMAN_VAL="null"
  HUMAN_CLARK_VAL="null"
  SOLO_JSON="true"
  HU_ENTRY=""

  if [[ "$IS_SOLO" == "n"* || "$IS_SOLO" == "N"* ]]; then
    printf "\n"
    while true; do
      read -rp "  Human's first name: " HU_RAW
      HUMAN_NAME=$(lower "$HU_RAW")
      HUMAN_CLARK_NAME="clark-${HUMAN_NAME}"
      printf "\n  ${D}You and ${B}${HU_RAW}${D} will be jointly responsible for\n"
      printf "  the ${B}${PROJ_NAME}${D} entity. ${HU_RAW} gets a Clark and\n"
      printf "  full access to the ${PROJ_NAME} AIOO.${R}\n\n"
      read -rp "  Do you want to proceed? [y/n]: " PROCEED
      [[ "$PROCEED" == "y"* || "$PROCEED" == "Y"* ]] && break
      printf "\n"
    done
    HUMAN_VAL="\"${HUMAN_NAME}\""
    HUMAN_CLARK_VAL="\"${HUMAN_CLARK_NAME}\""
    SOLO_JSON="false"
    HU_ENTRY="${HUMAN_CLARK_NAME}|${PROJ_NAME}"
    printf "\n  ${G}✓${R} ${B}${HUMAN_CLARK_NAME}${R} created — Clark + AIOO access for ${PROJ_NAME}.\n"
    printf "  ${D}${HU_RAW} is scoped strictly to the ${PROJ_NAME} entity.${R}\n"
  fi

  ENTITY_NAMES+=("$PROJ_NAME")
  HUMAN_CLARKS+=("$HU_ENTRY")

  printf "\n  ${G}✓${R} ${B}${PROJ_NAME}${R} entity registered — ${B}${AIOO_NAME}${R} assigned.\n"
  printf "  ${D}AIOO is the AI Operating Officer of ${PROJ_NAME}. It drives\n"
  printf "  execution, maintains the northstar, and spawns App Builders.${R}\n\n"

  SEP=""; [ -n "$ENTITIES_JSON" ] && SEP=","
  ENTITIES_JSON="${ENTITIES_JSON}${SEP}
    {\"name\":\"${PROJ_NAME}\",\"aioo\":\"${AIOO_NAME}\",\"northstar\":\"${NS_FILE}\",\"solo\":${SOLO_JSON},\"human\":${HUMAN_VAL},\"human_clark\":${HUMAN_CLARK_VAL}}"
  [ -n "$ENTITIES_ARRAY" ] && ENTITIES_ARRAY="${ENTITIES_ARRAY}, "
  ENTITIES_ARRAY="${ENTITIES_ARRAY}\"${PROJ_NAME}\""

  while true; do
    read -rp "  Add another entity? [y/n]: " MORE
    case "$MORE" in y*|Y*|n*|N*) break;; esac
  done
  printf "\n"
  [[ "$MORE" != "y"* && "$MORE" != "Y"* ]] && break
done

# Build clarks JSON
CLARKS_JSON="  {\"name\":\"${OWNER_CLARK}\",\"projects\":[${ENTITIES_ARRAY}]}"
for HU_ENTRY in "${HUMAN_CLARKS[@]}"; do
  [ -z "$HU_ENTRY" ] && continue
  HU_CLARK="${HU_ENTRY%%|*}"
  HU_PROJECT="${HU_ENTRY##*|}"
  CLARKS_JSON="${CLARKS_JSON},
  {\"name\":\"${HU_CLARK}\",\"projects\":[\"${HU_PROJECT}\"],\"aioo_access\":true}"
done

# ── Step 3: Generate ────────────────────────────────────────────────────────
step_banner 3 4 "Creating Vault & Config" \
  "config.json = source of truth — drives all agents and tools" \
  "Northstar   = seeded blank — edit it to define your vision" \
  "Logs/       = every agent action recorded, scoped per entity"

printf "{\n  \"owner\": \"${OWNER_NAME}\",\n  \"vaultPath\": \"${VAULT_PATH}\",\n  \"clarks\": [\n${CLARKS_JSON}\n  ],\n  \"entities\": [${ENTITIES_JSON}\n  ]\n}\n" > "$CONFIG_PATH"
printf "  ${G}✓${R} config.json written\n"

for PROJ in "${ENTITY_NAMES[@]}"; do
  mkdir -p "$VAULT_PATH/$PROJ/Raw/${OWNER_NAME}/{Clark,Submissions,HITLs,Coding}"
  mkdir -p "$VAULT_PATH/$PROJ/Raw/AIOO"
  mkdir -p "$VAULT_PATH/$PROJ/Raw/Clark"
  mkdir -p "$VAULT_PATH/$PROJ/Raw/Other"
  mkdir -p "$VAULT_PATH/$PROJ/Processing"
  mkdir -p "$VAULT_PATH/$PROJ/Distilled/Clark"
  mkdir -p "$VAULT_PATH/$PROJ/Distilled/AIOO"
  mkdir -p "$VAULT_PATH/$PROJ/Distilled/${OWNER_NAME}"
  mkdir -p "$VAULT_PATH/$PROJ/Distilled/shared"
  mkdir -p "$VAULT_PATH/$PROJ/Distilled/personal-story"
  mkdir -p "$VAULT_PATH/$PROJ/Distilled/Archive"
  mkdir -p "$VAULT_PATH/$PROJ/Bin"
  mkdir -p "$VAULT_PATH/$PROJ/Logs"
  NS_FILE="$(upper "$PROJ")_NORTHSTAR.md"
  if [ ! -f "$VAULT_PATH/$PROJ/$NS_FILE" ]; then
    printf "# $(upper "$PROJ") NORTHSTAR\n\nDo One Thing. Earn Full Autonomy.\n\nEdit this file to define your long-term vision for ${PROJ}.\n" > "$VAULT_PATH/$PROJ/$NS_FILE"
  fi
  printf "  ${G}✓${R} ${PROJ}/ vault created\n"
done

printf "\n  ${B}Vault structure:${R}\n"
printf "  ${D}(Logs/ = every agent action, tool run, and App build,\n"
printf "   scoped per entity + one global system log)${R}\n\n"
printf "  memory-vault/\n"
for PROJ in "${ENTITY_NAMES[@]}"; do
  printf "  ${Y}├── ${PROJ}/${R}\n"
  printf "  │   ├── Raw/${OWNER_NAME}/{Clark, Submissions, HITLs, Coding}\n"
  printf "  │   ├── Raw/{AIOO, Clark, Other}\n"
  printf "  │   ├── Processing/\n"
  printf "  │   ├── Distilled/{Clark, AIOO, ${OWNER_NAME}, shared, personal-story, Archive}\n"
  printf "  │   ├── Bin/\n"
  printf "  │   ├── Logs/\n"
  printf "  │   └── $(upper "$PROJ")_NORTHSTAR.md\n"
done
printf "\n"

# ── Step 4: Start Context Extractor ────────────────────────────────────────
step_banner 4 4 "Starting Context Extractor" \
  "Context Extractor = watches Raw/ and distills notes for agents" \
  "Raw/              = drop any .md — archived + distilled in 2s" \
  "Distilled/        = cleaned summaries read by Clark and AIOO"
cd "$REPO_DIR"
# Create Docker network
printf "  Creating Docker network...\n"
docker network create personal-ai-net 2>/dev/null && ok "personal-ai-net created" || printf "  ${D}  personal-ai-net already exists${R}\n"

# Start Context Extractor (simple mode) + LiteLLM proxy
printf "  Starting services...\n"
docker compose --profile seed up -d --build 2>&1 | grep -E "✔|Built|Started|Error|WARN|error" || true

# Build NanoClaw-enhanced agent images
printf "\n  Building agent images (first time only, ~3 min each)...\n"
docker build -t personal-ai-aioo "$REPO_DIR/aioo/" 2>&1 | tail -1 || true
docker build -t personal-ai-clark "$REPO_DIR/clark/" 2>&1 | tail -1 || true
docker build -t personal-ai-app-builder "$REPO_DIR/app-builder/" 2>&1 | tail -1 || true
printf "  ${G}✓${R} Agent images built\n"

# Optional: WhatsApp setup
printf "\n  ${B}WhatsApp Setup (optional)${R}\n"
printf "  ${D}WhatsApp enables messaging with your agents from your phone.${R}\n"
while true; do
  read -rp "  Set up WhatsApp now? [y/n]: " WA_SETUP
  case "$WA_SETUP" in y*|Y*|n*|N*) break;; esac
done
if [[ "$WA_SETUP" == "y"* || "$WA_SETUP" == "Y"* ]]; then
  "$REPO_DIR/setup/setup-whatsapp.sh"
else
  printf "  ${D}Skipped — run setup/setup-whatsapp.sh later to enable.${R}\n"
fi

# Run verification
printf "\n  Running verification...\n\n"
"$REPO_DIR/setup/verify.sh" || true

printf "\n${B}${G}╔${LINE}\n"
printf "║  Setup complete. Personal AI v0.4 is live.\n"
printf "╚${LINE}${R}\n\n"
ENTITY_LIST=$(IFS=', '; echo "${ENTITY_NAMES[*]}")
printf "  Owner:    ${B}${OWNER_NAME}${R} (${OWNER_CLARK})\n"
printf "  Entities: ${B}${ENTITY_LIST}${R}\n"
printf "  Vault:    ${B}${VAULT_PATH}${R}\n\n"
printf "  Start AIOO:     ${B}./aioo/aioo.sh <entity>${R}\n"
printf "  Start Clark:    ${B}./clark/clark.sh${R}\n"
printf "  Spawn builder:  ${B}./app-builder/app-builder.sh <entity> <app-name>${R}\n"
printf "  Drop notes:     memory-vault/{entity}/Raw/\n"
printf "  Add entity:     ${B}./setup/add-entity.sh${R}\n"
printf "  Add human:      ${B}./setup/add-human.sh${R}\n"
printf "  Verify system:  ${B}./setup/verify.sh${R}\n\n"
