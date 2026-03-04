#!/bin/bash
# Personal AI v0.2 — App Builder Launcher
# Usage: ./app-builder.sh <entity> <app-name>
# Example: ./app-builder.sh onething plusone
set -euo pipefail

ENTITY="${1:?Usage: app-builder.sh <entity> <app-name>}"
APP="${2:?Usage: app-builder.sh <entity> <app-name>}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
VAULT_PATH="$REPO_DIR/memory-vault"
CONTAINER="app-${ENTITY}-${APP}"
IMAGE="personal-ai-app-builder"

G="\033[32m" Y="\033[33m" C="\033[36m" B="\033[1m" D="\033[2m" R="\033[0m"

# ── UI helpers ─────────────────────────────────────────────────────────────
W=64
LINE=$(printf '═%.0s' $(seq 1 $W))

banner_main() {
  printf "${B}${G}╔${LINE}\n"
  printf "║  Personal AI v0.2 — App Builder\n"
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

# ── Step 1: GitHub ─────────────────────────────────────────────────────────
step_banner 1 3 "GitHub Repository" \
  "Git     = version control — tracks every change you make" \
  "Remote  = your GitHub repo where the code is stored" \
  "PAT     = Personal Access Token — GitHub password for HTTPS"

GITHUB_REMOTE=""
GITHUB_TOKEN=""
printf "  Does ${B}${APP}${R} already have a GitHub repo? [y/n]: "
read -r HAS_REPO
printf "\n"

if [[ "$HAS_REPO" == "y"* || "$HAS_REPO" == "Y"* ]]; then
  printf "  ${D}Paste the HTTPS URL from the repo's main page on GitHub.${R}\n"
  printf "  ${D}Example: https://github.com/username/my-app${R}\n\n"
  while true; do
    printf "  Repo URL: "
    read -r GITHUB_REMOTE
    GITHUB_REMOTE="${GITHUB_REMOTE%/}"
    [[ "$GITHUB_REMOTE" != *.git ]] && GITHUB_REMOTE="${GITHUB_REMOTE}.git"
    printf "\n  You entered: ${B}${GITHUB_REMOTE}${R}\n"
    printf "  Confirm? [y/n]: "
    read -r CONFIRM
    [[ "$CONFIRM" == "y"* || "$CONFIRM" == "Y"* ]] && break
    printf "\n"
  done
  printf "  ${G}✓${R} Remote confirmed\n\n"
else
  printf "  ${B}Create the repo on GitHub now:${R}\n"
  printf "  1. Go to ${C}https://github.com/new${R}\n"
  printf "  2. Name it after your app, choose visibility\n"
  printf "  3. Leave ALL init options unchecked (no README, no .gitignore)\n"
  printf "  4. Click Create — copy the HTTPS URL from the next screen\n\n"
  printf "  Paste the URL (or Enter to skip): "
  read -r GITHUB_REMOTE
  if [ -n "$GITHUB_REMOTE" ]; then
    GITHUB_REMOTE="${GITHUB_REMOTE%/}"
    [[ "$GITHUB_REMOTE" != *.git ]] && GITHUB_REMOTE="${GITHUB_REMOTE}.git"
    printf "  ${G}✓${R} Remote: ${D}${GITHUB_REMOTE}${R}\n\n"
  else
    printf "  ${D}Skipped — set it later inside the container:${R}\n"
    printf "  ${D}git remote add origin https://github.com/username/repo.git${R}\n\n"
  fi
fi

# ── GitHub PAT ─────────────────────────────────────────────────────────────
if [ -n "$GITHUB_REMOTE" ]; then
  printf "  ${B}GitHub Personal Access Token${R}\n"
  printf "  ${D}Claude Code needs this to push/pull inside the container.${R}\n"
  printf "  ${D}The token is passed as an environment variable — never stored in files.${R}\n\n"
  printf "  ${D}Need one? GitHub → Settings → Developer Settings${R}\n"
  printf "  ${D}→ Personal Access Tokens (classic) → repo scope.${R}\n\n"
  printf "  PAT (paste, then Enter): "
  read -rs GITHUB_TOKEN
  printf "\n"
  if [ -n "$GITHUB_TOKEN" ]; then
    printf "  ${G}✓${R} PAT received (not echoed for security)\n\n"
  else
    printf "  ${Y}!${R} No PAT — git push/pull won't work until you set one.\n"
    printf "  ${D}Inside the container: export GITHUB_TOKEN=ghp_your_token${R}\n\n"
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

NORTHSTAR_TMP=$(mktemp /tmp/northstar-XXXXXX)
if [ -n "$NS_FILE" ]; then
  cp "$NS_FILE" "$NORTHSTAR_TMP"
else
  printf "# NORTHSTAR\n\nEdit memory-vault/${ENTITY}/*_NORTHSTAR.md\n" > "$NORTHSTAR_TMP"
fi

DOCKER_ENV_ARGS=(-e "ENTITY=$ENTITY" -e "APP=$APP")
[ -n "$GITHUB_TOKEN" ] && DOCKER_ENV_ARGS+=(-e "GITHUB_TOKEN=$GITHUB_TOKEN")

docker run -d --name "$CONTAINER" \
  -v "$VAULT_PATH/$ENTITY/Distilled:/vault/Distilled:ro" \
  -v "$VAULT_PATH/$ENTITY/Logs:/vault/Logs" \
  -v "$SCRIPT_DIR/CLAUDE.md:/workspace/CLAUDE.md:ro" \
  -v "$NORTHSTAR_TMP:/workspace/NORTHSTAR.md:ro" \
  "${DOCKER_ENV_ARGS[@]}" \
  "$IMAGE" > /dev/null

docker exec "$CONTAINER" git init /workspace > /dev/null 2>&1 || true
docker exec "$CONTAINER" git -C /workspace config user.email "app@personal-ai" > /dev/null 2>&1 || true
docker exec "$CONTAINER" git -C /workspace config user.name "${ENTITY}-${APP}" > /dev/null 2>&1 || true
[ -n "$GITHUB_REMOTE" ] && docker exec "$CONTAINER" git -C /workspace remote add origin "$GITHUB_REMOTE" > /dev/null 2>&1 || true

printf "  ${G}✓${R} Container started\n"
printf "  ${G}✓${R} CLAUDE.md + NORTHSTAR.md loaded\n"
printf "  ${G}✓${R} Entity context mounted (read-only)\n"
[ -n "$GITHUB_REMOTE" ] && printf "  ${G}✓${R} GitHub remote wired\n"
[ -n "$GITHUB_TOKEN" ] && printf "  ${G}✓${R} GitHub PAT configured — git push/pull ready\n"
printf "\n"

# ── Step 3: What's next ────────────────────────────────────────────────────
step_banner 3 3 "You're Ready — What To Do Next" \
  "Claude Code  = the AI agent running inside your App Builder" \
  "NORTHSTAR    = your compass — Claude reads it first every session" \
  "Git push     = how your work leaves the container to GitHub"

printf "  ${B}1. Enter your App Builder:${R}\n"
printf "     ${G}docker exec -it ${CONTAINER} claude${R}\n\n"
printf "  ${B}2. First thing to say to Claude:${R}\n"
printf "     ${D}\"Read NORTHSTAR.md. Then read /vault/Distilled/.\n"
printf "     Tell me what the One Thing is and propose a starting point.\"${R}\n\n"
printf "  ${B}3. When you're done working, commit and push:${R}\n"
printf "     ${D}git add . && git commit -m \"your message\" && git push${R}\n\n"
printf "  ${B}4. Pause and come back later:${R}\n"
printf "     ${D}Just exit Claude Code — container keeps running.${R}\n"
printf "     ${D}Re-attach: docker exec -it ${CONTAINER} claude${R}\n\n"
printf "  ${B}5. Stop the App Builder when done for the day:${R}\n"
printf "     ${D}docker stop ${CONTAINER} && docker rm ${CONTAINER}${R}\n\n"

printf "${B}${G}╔${LINE}\n"
printf "║  ${B}${CONTAINER}${G} is live.\n"
printf "╚${LINE}${R}\n\n"
