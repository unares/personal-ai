#!/bin/bash
# Personal AI — App Builder Launcher
# Usage: ./app-builder.sh <entity> <app-name>
# Example: ./app-builder.sh onething plusone
set -euo pipefail

ENTITY="${1:?Usage: app-builder.sh <entity> <app-name>}"
APP="${2:?Usage: app-builder.sh <entity> <app-name>}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
source "$REPO_DIR/version.sh"
VAULT_PATH="$REPO_DIR/memory-vault"
CONFIG_PATH="$REPO_DIR/config.json"
CONTAINER="app-${ENTITY}-${APP}"
IMAGE="personal-ai-app-builder"

G="\033[32m" Y="\033[33m" C="\033[36m" B="\033[1m" D="\033[2m" R="\033[0m"

# ── UI helpers ─────────────────────────────────────────────────────────────
W=64
LINE=$(printf '═%.0s' $(seq 1 $W))

banner_main() {
  printf "${B}${G}╔${LINE}\n"
  printf "║  Personal AI v${VERSION} — App Builder\n"
  printf "║  Do One Thing. Earn Full Autonomy.\n"
  printf "╚${LINE}${R}\n\n"
}

step_banner() {
  local step=$1 total=$2 title="$3"
  local filled=$((step >= total ? 16 : step * 16 / total))
  local empty=$((16 - filled))
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

clear
banner_main
printf "  You are setting up an isolated build environment for:\n\n"
printf "  App:     ${B}${APP}${R}\n"
printf "  Entity:  ${B}${ENTITY}${R}\n"
printf "  Container will be named: ${B}${CONTAINER}${R}\n\n"
printf "  ${D}The App Builder is a self-contained Claude Code workspace\n"
printf "  named after the app it builds. It inherits the entity\n"
printf "  northstar and context, and grows with the app over time.${R}\n\n"

# ── Validate entity ────────────────────────────────────────────────────────
if [ ! -d "$VAULT_PATH/$ENTITY" ]; then
  printf "  ${Y}Error:${R} entity '${ENTITY}' not found in memory-vault.\n"
  printf "  Available: $(ls "$VAULT_PATH" | grep -v Logs | tr '\n' ' ')\n\n"
  exit 1
fi

NS_FILE=$(find "$VAULT_PATH/$ENTITY" -maxdepth 1 -name "*_NORTHSTAR.md" | head -1)
printf "  ${G}✓${R} Entity vault found\n"
[ -n "$NS_FILE" ] && printf "  ${G}✓${R} Northstar: ${D}$(basename "$NS_FILE")${R}\n" \
  || printf "  ${Y}!${R} No northstar yet — edit memory-vault/${ENTITY}/*_NORTHSTAR.md\n"
printf "\n"

# ── Step 1: Workspace & GitHub ─────────────────────────────────────────────
step_banner 1 3 "Workspace" \
  "Workspace = where your app's code lives inside the container" \
  "GitHub    = reads repo from config.json if available" \
  "PAT       = uses GITHUB_TOKEN from .env — not stored per container"

GITHUB_REMOTE=""
GITHUB_TOKEN="${GITHUB_TOKEN:-}"
GITHUB_BRANCH="main"
CLONE_REPO=false
MOUNT_PATH=""

# Read GitHub config from config.json
CONFIG_GH_REPO=""
if [ -f "$CONFIG_PATH" ] && command -v node > /dev/null 2>&1; then
  CONFIG_GH_REPO=$(node -e "const c=require('${CONFIG_PATH}'); const e=(c.entities||[]).find(x=>x.name==='${ENTITY}'); if(e&&e.github) console.log(e.github.repo); else console.log('')" 2>/dev/null) || true
  if [ -n "$CONFIG_GH_REPO" ]; then
    GITHUB_BRANCH=$(node -e "const c=require('${CONFIG_PATH}'); const e=(c.entities||[]).find(x=>x.name==='${ENTITY}'); console.log(e&&e.github&&e.github.default_branch||'main')" 2>/dev/null) || GITHUB_BRANCH="main"
  fi
fi

# Read PAT from .env if not already set
if [ -z "$GITHUB_TOKEN" ] && [ -f "$REPO_DIR/.env" ]; then
  GITHUB_TOKEN=$(grep -E "^GITHUB_TOKEN=" "$REPO_DIR/.env" 2>/dev/null | cut -d'=' -f2- | tr -d "'\"" || true)
fi

if [ -n "$CONFIG_GH_REPO" ]; then
  printf "  Entity:  ${B}${ENTITY}${R}\n"
  printf "  GitHub:  ${B}${CONFIG_GH_REPO}${R} ${D}(from config.json)${R}\n"
  [ -n "$GITHUB_TOKEN" ] && printf "  PAT:     ${G}✓ configured${R}\n" || printf "  PAT:     ${Y}not set${R} ${D}— add GITHUB_TOKEN to .env${R}\n"
  printf "\n"

  printf "  ${B}Workspace options:${R}\n"
  printf "    ${C}1.${R} Fresh clone (new branch from ${GITHUB_BRANCH})\n"
  printf "    ${C}2.${R} Mount existing directory from host\n"
  printf "    ${C}3.${R} Different repo / manual URL\n"
  printf "    ${C}4.${R} Empty workspace (no git)\n\n"

  read -rp "  Select [1-4]: " WS_CHOICE
  printf "\n"

  case "$WS_CHOICE" in
    1)
      GITHUB_REMOTE="https://github.com/${CONFIG_GH_REPO}.git"
      CLONE_REPO=true
      printf "  ${G}✓${R} Will clone ${CONFIG_GH_REPO} → branch app-builder/${APP}-$(date +%Y%m%d)\n\n"
      ;;
    2)
      printf "  Host path to mount (e.g. ~/projects/${APP}): "
      read -r MOUNT_PATH
      MOUNT_PATH="${MOUNT_PATH/#\~/$HOME}"
      if [ -d "$MOUNT_PATH" ]; then
        printf "  ${G}✓${R} Will mount ${MOUNT_PATH} as /workspace\n\n"
      else
        printf "  ${Y}!${R} Directory not found — will create on launch.\n\n"
        mkdir -p "$MOUNT_PATH" 2>/dev/null || true
      fi
      # Still set remote from config for convenience
      GITHUB_REMOTE="https://github.com/${CONFIG_GH_REPO}.git"
      ;;
    3)
      # Fall through to manual entry below
      CONFIG_GH_REPO=""
      ;;
    4)
      printf "  ${D}Empty workspace — no git remote.${R}\n\n"
      ;;
    *)
      printf "  ${D}Invalid — defaulting to empty workspace.${R}\n\n"
      ;;
  esac
fi

# Manual GitHub entry (option 3, or no config.json entry)
if [ -z "$CONFIG_GH_REPO" ] && [ -z "$GITHUB_REMOTE" ] && [ -z "$MOUNT_PATH" ]; then
  printf "  Does ${B}${APP}${R} have a GitHub repo? [y/n]: "
  read -r HAS_REPO
  printf "\n"

  if [[ "$HAS_REPO" == "y"* || "$HAS_REPO" == "Y"* ]]; then
    printf "  ${D}Paste the HTTPS URL or owner/repo.${R}\n"
    printf "  ${D}Example: https://github.com/username/my-app${R}\n\n"
    while true; do
      printf "  Repo: "
      read -r GH_RAW
      # Normalize input
      GH_RAW="${GH_RAW#https://github.com/}"
      GH_RAW="${GH_RAW%.git}"
      GH_RAW="${GH_RAW%/}"
      GITHUB_REMOTE="https://github.com/${GH_RAW}.git"
      printf "\n  Remote: ${B}${GITHUB_REMOTE}${R}\n"
      printf "  Confirm? [y/n]: "
      read -r CONFIRM
      [[ "$CONFIRM" == "y"* || "$CONFIRM" == "Y"* ]] && break
      printf "\n"
    done
    printf "  ${G}✓${R} Remote confirmed\n\n"
  else
    printf "  ${D}No repo — set it later: git remote add origin <url>${R}\n\n"
  fi

  # PAT prompt only if we have a remote and no token
  if [ -n "$GITHUB_REMOTE" ] && [ -z "$GITHUB_TOKEN" ]; then
    printf "  ${B}GitHub Personal Access Token${R}\n"
    printf "  ${D}Needed for push/pull inside the container.${R}\n"
    printf "  ${D}Or add GITHUB_TOKEN to .env for all future launches.${R}\n\n"
    printf "  PAT (paste, then Enter): "
    read -rs GITHUB_TOKEN
    printf "\n"
    if [ -n "$GITHUB_TOKEN" ]; then
      printf "  ${G}✓${R} PAT received\n\n"
    else
      printf "  ${Y}!${R} No PAT — git push/pull won't work until you set one.\n\n"
    fi
  fi
fi

# ── Step 2: Launch ─────────────────────────────────────────────────────────
step_banner 2 3 "Launching App Builder" \
  "App Builder  = Claude Code container dedicated to one app" \
  "Workspace    = /workspace/ — your isolated build space" \
  "Distilled    = entity context prepared by Context Extractor (read-only)"

if ! docker image inspect "$IMAGE" > /dev/null 2>&1; then
  printf "  Building App Builder image (first time only, ~2 min)...\n\n"
  docker build -t "$IMAGE" "$SCRIPT_DIR/" 2>&1 | grep -E "✔|Step|error" || true
  printf "\n"
fi

# Hydrate WELCOME.md
WELCOME_TMP=$(mktemp /tmp/welcome-XXXXXX)
HUMAN_LIST=$(node -e "const c=require('${CONFIG_PATH}'); const e=c.entities.find(x=>x.name==='${ENTITY}'); const h=[c.owner]; if(e&&e.human) h.push(e.human); console.log(h.join(', '))")
sed -e "s/{ROLE}/App Builder/g" -e "s/{CONTAINER_NAME}/${CONTAINER}/g" -e "s/{ENTITY}/${ENTITY}/g" -e "s/{HUMAN_LIST}/${HUMAN_LIST}/g" "$REPO_DIR/WELCOME.md" > "$WELCOME_TMP"

NORTHSTAR_TMP=$(mktemp /tmp/northstar-XXXXXX)
if [ -n "$NS_FILE" ]; then
  cp "$NS_FILE" "$NORTHSTAR_TMP"
else
  printf "# NORTHSTAR\n\nEdit memory-vault/${ENTITY}/*_NORTHSTAR.md\n" > "$NORTHSTAR_TMP"
fi

DOCKER_ENV_ARGS=(-e "ENTITY=$ENTITY" -e "APP=$APP")
[ -n "$GITHUB_TOKEN" ] && DOCKER_ENV_ARGS+=(-e "GITHUB_TOKEN=$GITHUB_TOKEN")

# Volume args — workspace mount varies by mode
DOCKER_VOL_ARGS=(
  -v "$VAULT_PATH/$ENTITY/Distilled:/vault/Distilled:ro"
  -v "$VAULT_PATH/$ENTITY/Logs:/vault/Logs"
  -v "$SCRIPT_DIR/CLAUDE.md:/workspace/CLAUDE.md:ro"
  -v "$NORTHSTAR_TMP:/workspace/NORTHSTAR.md:ro"
  -v "$WELCOME_TMP:/WELCOME.md:ro"
)

# Mount existing directory if requested
if [ -n "$MOUNT_PATH" ]; then
  DOCKER_VOL_ARGS+=(-v "${MOUNT_PATH}:/workspace/app")
fi

# Ensure Docker network exists (for Context Extractor API access)
docker network create personal-ai-net 2>/dev/null || true

# AIOO can also spawn App Builders automatically via /spawn-app-builder skill.
docker run -d --name "$CONTAINER" \
  --network personal-ai-net \
  "${DOCKER_VOL_ARGS[@]}" \
  "${DOCKER_ENV_ARGS[@]}" \
  "$IMAGE" > /dev/null

# Git setup
if $CLONE_REPO && [ -n "$GITHUB_REMOTE" ] && [ -n "$GITHUB_TOKEN" ]; then
  BRANCH_NAME="app-builder/${APP}-$(date +%Y%m%d)"
  printf "  Cloning ${CONFIG_GH_REPO}...\n"
  docker exec "$CONTAINER" git clone "https://x-access-token:${GITHUB_TOKEN}@github.com/${CONFIG_GH_REPO}.git" /workspace/app > /dev/null 2>&1 || true
  docker exec "$CONTAINER" git -C /workspace/app checkout -b "$BRANCH_NAME" > /dev/null 2>&1 || true
  docker exec "$CONTAINER" git -C /workspace/app config user.email "app@personal-ai" > /dev/null 2>&1 || true
  docker exec "$CONTAINER" git -C /workspace/app config user.name "${ENTITY}-${APP}" > /dev/null 2>&1 || true
  printf "  ${G}✓${R} Cloned → branch ${B}${BRANCH_NAME}${R}\n"
elif [ -z "$MOUNT_PATH" ]; then
  docker exec "$CONTAINER" git init /workspace > /dev/null 2>&1 || true
  docker exec "$CONTAINER" git -C /workspace config user.email "app@personal-ai" > /dev/null 2>&1 || true
  docker exec "$CONTAINER" git -C /workspace config user.name "${ENTITY}-${APP}" > /dev/null 2>&1 || true
  [ -n "$GITHUB_REMOTE" ] && docker exec "$CONTAINER" git -C /workspace remote add origin "$GITHUB_REMOTE" > /dev/null 2>&1 || true
fi

printf "  ${G}✓${R} Container started\n"
printf "  ${G}✓${R} CLAUDE.md + NORTHSTAR.md loaded\n"
printf "  ${G}✓${R} Entity context mounted (read-only)\n"
[ -n "$GITHUB_REMOTE" ] && printf "  ${G}✓${R} GitHub remote wired\n"
[ -n "$GITHUB_TOKEN" ] && printf "  ${G}✓${R} GitHub PAT configured — git push/pull ready\n"
[ -n "$MOUNT_PATH" ] && printf "  ${G}✓${R} Host directory mounted at /workspace/app\n"
printf "\n"

# ── Step 3: What's next ────────────────────────────────────────────────────
step_banner 3 3 "You're Ready — What To Do Next" \
  "Claude Code  = the AI agent running inside your App Builder" \
  "NORTHSTAR    = your compass — Claude reads it first every session" \
  "Git push     = how your work leaves the container to GitHub"

printf "  ${B}1. Enter your App Builder:${R}\n"
printf "     ${G}docker exec -it ${CONTAINER} claude-code-launch${R}\n"
printf "     ${D}Or directly: docker exec -it ${CONTAINER} claude --dangerously-skip-permissions${R}\n\n"
printf "  ${B}2. First thing to say to Claude:${R}\n"
printf "     ${D}\"Read NORTHSTAR.md. Then read /vault/Distilled/.\n"
printf "     Tell me what the One Thing is and propose a starting point.\"${R}\n\n"
printf "  ${B}3. When you're done working, commit and push:${R}\n"
printf "     ${D}git add . && git commit -m \"your message\" && git push${R}\n\n"
printf "  ${B}4. Pause and come back later:${R}\n"
printf "     ${D}Just exit Claude Code — container keeps running.${R}\n"
printf "     ${D}Re-attach: docker exec -it ${CONTAINER} claude-code-launch${R}\n\n"
printf "  ${B}5. Stop the App Builder when done for the day:${R}\n"
printf "     ${D}docker stop ${CONTAINER} && docker rm ${CONTAINER}${R}\n\n"

printf "${B}${G}╔${LINE}\n"
printf "║  ${B}${CONTAINER}${G} is live.\n"
printf "╚${LINE}${R}\n\n"
