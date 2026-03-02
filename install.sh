#!/bin/bash
# Personal AI v0.2 — Guided Setup Wizard
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VAULT_PATH="$SCRIPT_DIR/chronicle-vault"
CONFIG_PATH="$SCRIPT_DIR/config.json"

G="\033[32m" Y="\033[33m" C="\033[36m" B="\033[1m" D="\033[2m" R="\033[0m"
W=64
LINE=$(printf '═%.0s' $(seq 1 $W))

step_banner() {
  local step=$1 total=$2 title="$3"
  local filled=$((step * 16 / total)) empty=$((16 - step * 16 / total))
  local bar="" i
  for i in $(seq 1 $filled); do bar="${bar}█"; done
  for i in $(seq 1 $empty); do bar="${bar}░"; done
  shift 3
  printf "${B}${G}╔${LINE}╗\n"
  printf "║  [Step %s/%s]  %s  %-20s║\n" "$step" "$total" "$bar" "$title"
  printf "╠${LINE}╣\n"
  while [ $# -gt 0 ]; do
    printf "║  ${C}▸${G} %-$((W-5))s║\n" "$1"
    shift
  done
  printf "╚${LINE}╝${R}\n\n"
}

upper() { echo "$1" | tr '[:lower:]' '[:upper:]'; }
lower() { echo "$1" | tr '[:upper:]' '[:lower:]' | tr ' ' '-'; }

confirm() {
  # Usage: confirm "Label" "value" → returns 0 if confirmed, 1 to retry
  while true; do
    printf "  ${D}You entered:${R} ${B}${2}${R}\n"
    read -rp "  Confirm? [y/n]: " YN
    case "$YN" in y*|Y*) return 0;; n*|N*) return 1;; esac
  done
}

ask() {
  # Usage: ask VARNAME "prompt"
  local _var="$1" _prompt="$2" _val=""
  while true; do
    read -rp "  ${_prompt}: " _val
    if confirm "$_prompt" "$_val"; then
      eval "$_var=$(lower "$_val")"
      return
    fi
    printf "  ${Y}Let's try again.${R}\n"
  done
}

ask_raw() {
  # Like ask but preserves original casing for display, lowercased for var
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
printf "${B}${G}╔${LINE}╗\n"
printf "║  %-$((W-2))s║\n" "Personal AI v0.2 — Setup Wizard"
printf "║  %-$((W-2))s║\n" "Do One Thing. Earn Full Autonomy."
printf "╚${LINE}╝${R}\n"
printf "\n  ${D}4 steps · ~2 minutes${R}\n\n"

# ── Step 1: Owner ──────────────────────────────────────────────────────────
step_banner 1 4 "Your Identity" \
  "Clark    = Clarity Architect — your personal AI compass" \
  "Northstar = your locked long-term vision, read by every agent" \
  "Vault     = your private, isolated, Markdown memory layer"

ask_raw OWNER_RAW "Your first name"
OWNER_NAME=$(lower "$OWNER_RAW")
OWNER_CLARK="clark-${OWNER_NAME}"

printf "\n  ${G}✓${R} ${B}${OWNER_CLARK}${R} created.\n"
printf "  ${D}You are the Personal AI super-user — your Clark will have\n"
printf "  read access to all company vaults you create. Co-founders\n"
printf "  you add will only see their own company.${R}\n\n"

# ── Step 2: Companies ──────────────────────────────────────────────────────
step_banner 2 4 "Your Companies" \
  "Company  = one project/startup you are building" \
  "AIOO     = AI Operating Officer — drives execution for a company" \
  "Vault    = isolated Markdown memory for each company"

PROJECTS_JSON=""
PROJECTS_ARRAY=""
PROJECT_NAMES=()
COFOUNDER_CLARKS=()
COMPANY_COUNT=0

while true; do
  COMPANY_COUNT=$((COMPANY_COUNT + 1))
  printf "  ${B}── Company #${COMPANY_COUNT} ─────────────────────────────────────${R}\n"

  ask_raw PROJ_RAW "Company / project name"
  PROJ_NAME=$(lower "$PROJ_RAW")
  NS_FILE="$(upper "$PROJ_NAME")_NORTHSTAR.md"
  AIOO_NAME="aioo-${PROJ_NAME}"

  printf "\n"
  while true; do
    read -rp "  Solo founder or co-founder? [s/c]: " SOLO_OR_CO
    case "$SOLO_OR_CO" in s*|S*|c*|C*) break;; esac
    printf "  ${Y}Please enter s or c.${R}\n"
  done

  COFOUNDER_NAME="null"
  COFOUNDER_CLARK_NAME="null"
  COFOUNDER_JSON="null, \"cofounders_clark\": null"
  SOLO_JSON="true"
  CF_ENTRY=""

  if [[ "$SOLO_OR_CO" == "c"* || "$SOLO_OR_CO" == "C"* ]]; then
    printf "\n"
    ask_raw CF_RAW "Co-founder's first name"
    COFOUNDER_NAME=$(lower "$CF_RAW")
    COFOUNDER_CLARK_NAME="clark-${COFOUNDER_NAME}"
    COFOUNDER_JSON="\"${COFOUNDER_NAME}\", \"cofounders_clark\": \"${COFOUNDER_CLARK_NAME}\""
    SOLO_JSON="false"
    CF_ENTRY="${COFOUNDER_CLARK_NAME}|${PROJ_NAME}"
    printf "\n  ${G}✓${R} ${B}${COFOUNDER_CLARK_NAME}${R} created — access to ${PROJ_NAME} vault only.\n"
    printf "  ${D}${CF_RAW}'s Clark is scoped strictly to ${PROJ_NAME}.${R}\n"
  fi

  PROJECT_NAMES+=("$PROJ_NAME")
  COFOUNDER_CLARKS+=("$CF_ENTRY")

  printf "\n  ${G}✓${R} ${B}${PROJ_NAME}${R} vault registered — ${B}${AIOO_NAME}${R} assigned.\n"
  printf "  ${D}AIOO is your AI Operating Officer for ${PROJ_NAME}. It has\n"
  printf "  full read/write access to the ${PROJ_NAME} vault and will\n"
  printf "  maintain the project northstar and spawn MVP builders.${R}\n\n"

  SEP=""; [ -n "$PROJECTS_JSON" ] && SEP=","
  PROJECTS_JSON="${PROJECTS_JSON}${SEP}
    {\"name\":\"${PROJ_NAME}\",\"aioo\":\"${AIOO_NAME}\",\"northstar\":\"${NS_FILE}\",\"solo\":${SOLO_JSON},\"cofounder\":${COFOUNDER_JSON}}"
  [ -n "$PROJECTS_ARRAY" ] && PROJECTS_ARRAY="${PROJECTS_ARRAY}, "
  PROJECTS_ARRAY="${PROJECTS_ARRAY}\"${PROJ_NAME}\""

  while true; do
    read -rp "  Add another company? [y/n]: " MORE
    case "$MORE" in y*|Y*|n*|N*) break;; esac
  done
  printf "\n"
  [[ "$MORE" != "y"* && "$MORE" != "Y"* ]] && break
done

# Build clarks JSON
CLARKS_JSON="  {\"name\":\"${OWNER_CLARK}\",\"projects\":[${PROJECTS_ARRAY}]}"
for CF_ENTRY in "${COFOUNDER_CLARKS[@]}"; do
  [ -z "$CF_ENTRY" ] && continue
  CF_CLARK="${CF_ENTRY%%|*}"
  CF_PROJECT="${CF_ENTRY##*|}"
  CLARKS_JSON="${CLARKS_JSON},
  {\"name\":\"${CF_CLARK}\",\"projects\":[\"${CF_PROJECT}\"]}"
done

# ── Step 3: Generate ───────────────────────────────────────────────────────
step_banner 3 4 "Creating Vault & Config" \
  "config.json = source of truth — drives all agents and tools" \
  "Northstar   = seeded blank, edit it to define your vision" \
  "Logs/       = every agent action recorded, scoped per company"

# Write config.json
printf "{\n  \"owner\": \"${OWNER_NAME}\",\n  \"vaultPath\": \"${VAULT_PATH}\",\n  \"clarks\": [\n${CLARKS_JSON}\n  ],\n  \"projects\": [${PROJECTS_JSON}\n  ]\n}\n" > "$CONFIG_PATH"
printf "  ${G}✓${R} config.json written\n"

mkdir -p "$VAULT_PATH/Logs"
for PROJ in "${PROJECT_NAMES[@]}"; do
  mkdir -p "$VAULT_PATH/$PROJ/Raw/Daily"
  mkdir -p "$VAULT_PATH/$PROJ/Raw/MVPs"
  mkdir -p "$VAULT_PATH/$PROJ/Raw/People"
  mkdir -p "$VAULT_PATH/$PROJ/Distilled/Clark"
  mkdir -p "$VAULT_PATH/$PROJ/Distilled/AIOO"
  mkdir -p "$VAULT_PATH/$PROJ/Archive/Raw"
  mkdir -p "$VAULT_PATH/$PROJ/Logs"
  NS_FILE="$(upper "$PROJ")_NORTHSTAR.md"
  if [ ! -f "$VAULT_PATH/$PROJ/$NS_FILE" ]; then
    printf "# $(upper "$PROJ") NORTHSTAR\n\nDo One Thing. Earn Full Autonomy.\n\nEdit this file to define your long-term vision for ${PROJ}.\n" > "$VAULT_PATH/$PROJ/$NS_FILE"
  fi
  printf "  ${G}✓${R} ${PROJ}/ vault created\n"
done

printf "\n  ${B}Vault structure:${R}\n"
printf "  ${D}(Logs/ = every agent action, tool run, and MVP build,\n"
printf "   scoped per company + one global system log)${R}\n\n"
printf "  chronicle-vault/\n"
for PROJ in "${PROJECT_NAMES[@]}"; do
  printf "  ${Y}├── ${PROJ}/${R}\n"
  printf "  │   ├── Raw/{Daily, MVPs, People}\n"
  printf "  │   ├── Distilled/{Clark, AIOO}\n"
  printf "  │   ├── Archive/Raw/\n"
  printf "  │   ├── Logs/           ${D}← ${PROJ} activity log${R}\n"
  printf "  │   └── $(upper "$PROJ")_NORTHSTAR.md\n"
done
printf "  └── Logs/               ${D}← system-wide Content Loader log${R}\n\n"

# ── Step 4: Start Content Loader ───────────────────────────────────────────
step_banner 4 4 "Starting Content Loader" \
  "Content Loader = watches Raw/ and distills notes for agents" \
  "Raw/           = drop any .md — archived + distilled in 2s" \
  "Distilled/     = cleaned summaries read by Clark and AIOO"
cd "$SCRIPT_DIR"
docker compose --profile seed up -d --build content-loader 2>&1 | grep -E "✔|Built|Started|Error|WARN|error" || true

printf "\n${B}${G}╔${LINE}╗\n"
printf "║  %-$((W-2))s║\n" "Setup complete. Personal AI v0.2 is live."
printf "╚${LINE}╝${R}\n\n"
PROJ_LIST=$(IFS=', '; echo "${PROJECT_NAMES[*]}")
printf "  Owner:     ${B}${OWNER_NAME}${R} (${OWNER_CLARK})\n"
printf "  Companies: ${B}${PROJ_LIST}${R}\n"
printf "  Vault:     ${B}${VAULT_PATH}${R}\n\n"
printf "  Drop notes:    chronicle-vault/{company}/Raw/\n"
printf "  Spawn builder: ${B}./app-builder.sh <company> <app-name>${R}\n"
printf "  Add company:   ${B}./add-company.sh${R}  ${D}(coming soon)${R}\n\n"
