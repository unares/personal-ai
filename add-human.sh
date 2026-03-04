#!/bin/bash
# Personal AI v0.2 — Add a Human to an Entity
# Usage: ./add-human.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_PATH="$SCRIPT_DIR/config.json"

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
printf "║  Personal AI v0.2 — Add Human\n"
printf "╚${LINE}${R}\n\n"

if [ ! -f "$CONFIG_PATH" ]; then
  printf "  ${Y}Error:${R} config.json not found. Run ./install.sh first.\n\n"
  exit 1
fi

if ! command -v node > /dev/null 2>&1; then
  printf "  ${Y}Error:${R} node is required. Install Node.js.\n\n"
  exit 1
fi

ENTITY_LIST=$(node -e "const c=require('${CONFIG_PATH}'); const e=c.entities||c.projects||[]; console.log(e.map(x=>x.name).join(', '))")
printf "  Entities: ${B}${ENTITY_LIST}${R}\n\n"

# ── Step 1: Pick entity ────────────────────────────────────────────────────
step_banner 1 2 "Select Entity & Human" \
  "Human    = a person jointly responsible for an entity" \
  "Clark    = their personal AI compass, scoped to this entity" \
  "AIOO     = they get full access to the entity AIOO as well"

printf "  Which entity are you adding a human to?\n"
printf "  ${D}Available: ${ENTITY_LIST}${R}\n\n"

ENTITY_NAME=""
while true; do
  read -rp "  Entity name: " ENTITY_NAME
  ENTITY_NAME=$(lower "$ENTITY_NAME")
  FOUND=$(node -e "const c=require('${CONFIG_PATH}'); const e=c.entities||c.projects||[]; console.log(e.some(x=>x.name==='${ENTITY_NAME}')?'yes':'no')")
  [ "$FOUND" = "yes" ] && break
  printf "  ${Y}Not found. Available: ${ENTITY_LIST}${R}\n"
done

printf "\n"

while true; do
  read -rp "  Human's first name: " HU_RAW
  HU_NAME=$(lower "$HU_RAW")
  HU_CLARK="clark-${HU_NAME}"
  printf "\n  ${D}You and ${B}${HU_RAW}${D} will be jointly responsible for\n"
  printf "  the ${B}${ENTITY_NAME}${D} entity. ${HU_RAW} gets a Clark and\n"
  printf "  full access to the ${ENTITY_NAME} AIOO.${R}\n\n"
  read -rp "  Do you want to proceed? [y/n]: " PROCEED
  [[ "$PROCEED" == "y"* || "$PROCEED" == "Y"* ]] && break
  printf "\n"
done

# ── Step 2: Update config ─────────────────────────────────────────────────
step_banner 2 2 "Updating Config" \
  "clark-{name}  = new Clark scoped to ${ENTITY_NAME}" \
  "aioo_access   = true — this human can drive the entity AIOO" \
  "config.json   = updated, no vault changes needed"

export CONFIG_PATH
export ENTITY_NAME_VAL="$ENTITY_NAME"
export HU_NAME_VAL="$HU_NAME"
export HU_CLARK_VAL="$HU_CLARK"

node << 'NODEEOF'
const fs = require('fs');
const c = JSON.parse(fs.readFileSync(process.env.CONFIG_PATH, 'utf8'));

const entityName = process.env.ENTITY_NAME_VAL;
const huName     = process.env.HU_NAME_VAL;
const huClark    = process.env.HU_CLARK_VAL;

if (!c.entities && c.projects) { c.entities = c.projects; delete c.projects; }

const entity = c.entities.find(e => e.name === entityName);
if (entity) {
  entity.solo = false;
  if (!entity.human) {
    entity.human = huName;
    entity.human_clark = huClark;
  }
}

const existing = c.clarks.find(cl => cl.name === huClark);
if (existing) {
  if (!existing.projects.includes(entityName)) existing.projects.push(entityName);
  existing.aioo_access = true;
} else {
  c.clarks.push({ name: huClark, projects: [entityName], aioo_access: true });
}

fs.writeFileSync(process.env.CONFIG_PATH, JSON.stringify(c, null, 2) + '\n');
NODEEOF

printf "  ${G}✓${R} ${HU_CLARK} added — Clark + AIOO access for ${ENTITY_NAME}\n"
printf "  ${G}✓${R} config.json updated\n\n"

printf "${B}${G}╔${LINE}\n"
printf "║  Human added.\n"
printf "╚${LINE}${R}\n\n"
printf "  Human:    ${B}${HU_NAME}${R}\n"
printf "  Clark:    ${B}${HU_CLARK}${R}\n"
printf "  Entity:   ${B}${ENTITY_NAME}${R}\n"
printf "  Access:   Clark (read) + AIOO (full)\n\n"
printf "  ${D}${HU_RAW} sees memory-vault/${ENTITY_NAME}/Distilled/\n"
printf "  and can co-drive the ${ENTITY_NAME} AIOO.${R}\n\n"
printf "  Share with ${HU_RAW}:\n"
printf "  ${B}docker exec -it ${HU_CLARK} claude${R}\n\n"
