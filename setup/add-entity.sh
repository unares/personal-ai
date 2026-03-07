#!/bin/bash
# Personal AI — Add Entity
# Usage: ./add-entity.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
source "$REPO_DIR/version.sh"
VAULT_PATH="$REPO_DIR/memory-vault"
CONFIG_PATH="$REPO_DIR/config.json"

G="\033[32m" Y="\033[33m" C="\033[36m" B="\033[1m" D="\033[2m" R="\033[0m"
W=64
LINE=$(printf '═%.0s' $(seq 1 $W))

step_banner() {
  local step=$1 total=$2 title="$3"
  local filled; filled=$((step >= total ? 16 : step * 16 / total))
  local empty; empty=$((16 - filled))
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

check_context() {
  local entity="$1"
  local raw_dir="$VAULT_PATH/$entity/Raw"
  local md_count; md_count=$(find "$raw_dir" -name "*.md" -type f 2>/dev/null | wc -l)
  if [ "$md_count" -eq 0 ]; then
    printf "\n  ${Y}!${R} ${B}${entity}${R} vault is empty — no .md files in Raw/\n"
    printf "  ${D}  Drop .md notes into memory-vault/${entity}/Raw/ to feed Context Extractor.${R}\n"
    printf "  ${D}  Or run ./setup/context-sync.sh to pull from Google Drive.${R}\n\n"
  fi
}

log_setup() {
  local event="$1" entity="${2:-}" pts="${3:-0}" detail="${4:-}"
  local log_dir="$VAULT_PATH/Logs"
  mkdir -p "$log_dir"
  local ts; ts=$(date -u +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || date +"%Y-%m-%dT%H:%M:%SZ")
  local entry="{\"ts\":\"$ts\",\"event\":\"$event\",\"entity\":\"$entity\",\"pts\":$pts,\"detail\":\"$detail\"}"
  echo "$entry" >> "$log_dir/setup.jsonl" 2>/dev/null || true
}

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
printf "║  Personal AI v${VERSION} — Entity Portfolio\n"
printf "╚${LINE}${R}\n\n"

if [ ! -f "$CONFIG_PATH" ]; then
  printf "  ${Y}Error:${R} config.json not found. Run ./install.sh first.\n\n"
  exit 1
fi

if ! command -v node > /dev/null 2>&1; then
  printf "  ${Y}Error:${R} node is required. Install Node.js.\n\n"
  exit 1
fi

EXISTING=$(node -e "const c=require('${CONFIG_PATH}'); const e=c.entities||c.projects||[]; console.log(e.map(x=>x.name).join(', '))")
OWNER=$(node -e "const c=require('${CONFIG_PATH}'); console.log(c.owner)")
printf "  Owner:             ${B}${OWNER}${R}\n"
printf "  Existing entities: ${B}${EXISTING}${R}\n\n"

# ── Step 1: Entity details ─────────────────────────────────────────────────
step_banner 1 4 "New Entity" \
  "Entity   = a company or major project Apps are built under" \
  "Human    = another person jointly responsible for this entity" \
  "AIOO     = AI Operating Officer assigned to drive this entity"

ask_raw PROJ_RAW "New entity name"
PROJ_NAME=$(lower "$PROJ_RAW")

EXISTS=$(node -e "const c=require('${CONFIG_PATH}'); const e=c.entities||c.projects||[]; console.log(e.some(x=>x.name==='${PROJ_NAME}')?'yes':'no')")
if [ "$EXISTS" = "yes" ]; then
  printf "\n  ${Y}Error:${R} entity '${PROJ_NAME}' already exists.\n\n"
  exit 1
fi

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
  HU_ENTRY="$HUMAN_CLARK_NAME"
  printf "\n  ${G}✓${R} ${B}${HUMAN_CLARK_NAME}${R} will be added — Clark + AIOO access for ${PROJ_NAME}.\n"
fi

# ── Step 2: GitHub Repository (optional) ──────────────────────────────────
step_banner 2 4 "GitHub Repository" \
  "GitHub  = where your entity's code lives (owner/repo)" \
  "PAT     = uses GITHUB_TOKEN from .env — not stored in config" \
  "Skip    = you can add this later via add-entity.sh"

GITHUB_REPO=""
GITHUB_BRANCH="main"
GITHUB_JSON="null"

printf "  GitHub repo for ${B}${PROJ_NAME}${R} (owner/repo, or Enter to skip): "
read -r GH_INPUT

if [ -n "$GH_INPUT" ]; then
  # Normalize: strip https://github.com/ prefix if pasted
  GH_INPUT="${GH_INPUT#https://github.com/}"
  GH_INPUT="${GH_INPUT%.git}"
  GH_INPUT="${GH_INPUT%/}"
  GITHUB_REPO="$GH_INPUT"

  printf "\n  Testing connection to ${B}${GITHUB_REPO}${R}...\n"
  GH_OK=false
  GH_INFO=""

  if command -v gh > /dev/null 2>&1; then
    GH_RESULT=$(gh api "repos/${GITHUB_REPO}" --jq '.private, .default_branch, (.size // 0)' 2>/dev/null) && GH_OK=true || true
  fi

  if ! $GH_OK && [ -n "${GITHUB_TOKEN:-}" ]; then
    GH_RESULT=$(curl -sf -H "Authorization: token ${GITHUB_TOKEN}" "https://api.github.com/repos/${GITHUB_REPO}" 2>/dev/null | node -e "const d=require('fs').readFileSync('/dev/stdin','utf8'); const j=JSON.parse(d); console.log(j.private+'\n'+j.default_branch+'\n'+(j.size||0))" 2>/dev/null) && GH_OK=true || true
  fi

  if ! $GH_OK; then
    # Try unauthenticated
    GH_RESULT=$(curl -sf "https://api.github.com/repos/${GITHUB_REPO}" 2>/dev/null | node -e "const d=require('fs').readFileSync('/dev/stdin','utf8'); const j=JSON.parse(d); console.log(j.private+'\n'+j.default_branch+'\n'+(j.size||0))" 2>/dev/null) && GH_OK=true || true
  fi

  if $GH_OK && [ -n "$GH_RESULT" ]; then
    GH_PRIVATE=$(echo "$GH_RESULT" | head -1)
    GITHUB_BRANCH=$(echo "$GH_RESULT" | sed -n '2p')
    GH_SIZE=$(echo "$GH_RESULT" | sed -n '3p')
    GH_VIS="public"; [ "$GH_PRIVATE" = "true" ] && GH_VIS="private"
    printf "  ${G}✓${R} connected (${GH_VIS} repo, default branch: ${GITHUB_BRANCH})\n"
  else
    printf "  ${Y}!${R} Could not verify — repo saved anyway. Check GITHUB_TOKEN in .env.\n"
  fi

  GITHUB_JSON="{\"repo\":\"${GITHUB_REPO}\",\"default_branch\":\"${GITHUB_BRANCH}\"}"
  printf "\n"
else
  printf "  ${D}Skipped — add later by editing config.json.${R}\n\n"
fi

# ── Step 3: Update config.json ────────────────────────────────────────────
step_banner 3 4 "Updating Config" \
  "config.json  = source of truth for all agents and tools" \
  "entities[]   = registered entities with AIOO assignments" \
  "clarks[]     = access control — who sees which entity vault"

export CONFIG_PATH
export ENTITY_VAL="$PROJ_NAME"
export AIOO_VAL="$AIOO_NAME"
export NS_VAL="$NS_FILE"
export SOLO_VAL="$SOLO_JSON"
export HUMAN_NAME_VAL="$HUMAN_NAME"
export HUMAN_CLARK_VAL="$HUMAN_CLARK_NAME"
export HU_ENTRY_VAL="$HU_ENTRY"
export OWNER_VAL="$OWNER"
export GITHUB_JSON_VAL="$GITHUB_JSON"

node << 'NODEEOF'
const fs = require('fs');
const c = JSON.parse(fs.readFileSync(process.env.CONFIG_PATH, 'utf8'));

const entityName   = process.env.ENTITY_VAL;
const aiooName     = process.env.AIOO_VAL;
const nsFile       = process.env.NS_VAL;
const isSolo       = process.env.SOLO_VAL === 'true';
const humanName    = process.env.HUMAN_NAME_VAL === 'null' ? null : process.env.HUMAN_NAME_VAL;
const humanClark   = process.env.HUMAN_CLARK_VAL === 'null' ? null : process.env.HUMAN_CLARK_VAL;
const huEntry      = process.env.HU_ENTRY_VAL;
const ownerName    = process.env.OWNER_VAL;
const ownerClark   = 'clark-' + ownerName;
const githubJson   = process.env.GITHUB_JSON_VAL;
const github       = githubJson === 'null' ? null : JSON.parse(githubJson);

if (!c.entities && c.projects) { c.entities = c.projects; delete c.projects; }
if (!c.entities) c.entities = [];

c.entities.push({ name: entityName, aioo: aiooName, northstar: nsFile, solo: isSolo, human: humanName, human_clark: humanClark, github: github });

const ownerEntry = c.clarks.find(cl => cl.name === ownerClark);
if (ownerEntry) { if (!ownerEntry.projects.includes(entityName)) ownerEntry.projects.push(entityName); }
else { c.clarks.push({ name: ownerClark, projects: [entityName] }); }

if (huEntry) {
  const existing = c.clarks.find(cl => cl.name === huEntry);
  if (existing) { if (!existing.projects.includes(entityName)) existing.projects.push(entityName); }
  else { c.clarks.push({ name: huEntry, projects: [entityName], aioo_access: true }); }
}

fs.writeFileSync(process.env.CONFIG_PATH, JSON.stringify(c, null, 2) + '\n');
NODEEOF

log_setup "CONFIG_UPDATED" "$PROJ_NAME" 0 "entity added"
printf "  ${G}✓${R} config.json updated\n"

# ── Step 4: Create vault ──────────────────────────────────────────────────
step_banner 4 4 "Creating Vault" \
  "Raw/       = drop .md notes — Context Extractor picks them up" \
  "Distilled/ = summaries auto-generated for Clark and AIOO" \
  "Logs/      = all agent activity for this entity"

OWNER=$(node -e "const c=require('${CONFIG_PATH}'); console.log(c.owner)")
mkdir -p "$VAULT_PATH/$PROJ_NAME/Raw/${OWNER}/{Clark,Submissions,HITLs,Coding}"
mkdir -p "$VAULT_PATH/$PROJ_NAME/Raw/AIOO"
mkdir -p "$VAULT_PATH/$PROJ_NAME/Raw/Clark"
mkdir -p "$VAULT_PATH/$PROJ_NAME/Raw/Other"
mkdir -p "$VAULT_PATH/$PROJ_NAME/Processing"
mkdir -p "$VAULT_PATH/$PROJ_NAME/Distilled/Clark"
mkdir -p "$VAULT_PATH/$PROJ_NAME/Distilled/AIOO"
mkdir -p "$VAULT_PATH/$PROJ_NAME/Distilled/${OWNER}"
mkdir -p "$VAULT_PATH/$PROJ_NAME/Distilled/shared"
mkdir -p "$VAULT_PATH/$PROJ_NAME/Distilled/personal-story"
mkdir -p "$VAULT_PATH/$PROJ_NAME/Distilled/Archive"
mkdir -p "$VAULT_PATH/$PROJ_NAME/Bin"
mkdir -p "$VAULT_PATH/$PROJ_NAME/Logs"
log_setup "ENTITY_CREATED" "$PROJ_NAME" 0 "$AIOO_NAME"
printf "  ${G}✓${R} ${PROJ_NAME}/ vault created\n"

if [ ! -f "$VAULT_PATH/$PROJ_NAME/$NS_FILE" ]; then
  printf "# $(upper "$PROJ_NAME") NORTHSTAR\n\nDo One Thing. Earn Full Autonomy.\n\nEdit this file to define your long-term vision for ${PROJ_NAME}.\n" > "$VAULT_PATH/$PROJ_NAME/$NS_FILE"
  printf "  ${G}✓${R} ${NS_FILE} seeded\n"
fi

check_context "$PROJ_NAME"

if docker ps --format '{{.Names}}' 2>/dev/null | grep -q "context-extractor"; then
  printf "\n  Restarting Context Extractor...\n"
  cd "$REPO_DIR"
  docker compose --profile seed restart context-extractor 2>&1 | grep -E "✔|Started|Error|error" || true
  printf "  ${G}✓${R} Context Extractor restarted\n"
fi

printf "\n${B}${G}╔${LINE}\n"
printf "║  Done. ${PROJ_NAME} is live.\n"
printf "╚${LINE}${R}\n\n"
printf "  Entity:   ${B}${PROJ_NAME}${R}\n"
printf "  AIOO:     ${B}${AIOO_NAME}${R}\n"
printf "  Vault:    ${B}${VAULT_PATH}/${PROJ_NAME}${R}\n\n"
printf "  Edit northstar: memory-vault/${PROJ_NAME}/${NS_FILE}\n"
printf "  Spawn builder:  ${B}./app-builder/app-builder.sh ${PROJ_NAME} <app-name>${R}\n"
printf "  Add a human:    ${B}./setup/add-human.sh${R}\n\n"
