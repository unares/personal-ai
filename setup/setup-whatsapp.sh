#!/bin/bash
# Personal AI — WhatsApp Setup
# Sets up WhatsApp authentication for Companion AI agents
# Usage: ./setup-whatsapp.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
source "$REPO_DIR/version.sh"
CONFIG_PATH="$REPO_DIR/config.json"

G="\033[32m" Y="\033[33m" C="\033[36m" B="\033[1m" D="\033[2m" R="\033[0m"
W=64
LINE=$(printf '═%.0s' $(seq 1 $W))

WHATSAPP_DIR="$HOME/.config/personal-ai/whatsapp"

clear
printf "${B}${G}╔${LINE}\n"
printf "║  Personal AI v${VERSION} — Companion AI WhatsApp Setup\n"
printf "║  Connect your Companion AI agents to WhatsApp.\n"
printf "╚${LINE}${R}\n\n"

# Show context from config if available
if [ -f "$CONFIG_PATH" ] && command -v node > /dev/null 2>&1; then
  OWNER=$(node -e "const c=require('${CONFIG_PATH}'); console.log(c.owner)" 2>/dev/null || echo "unknown")
  ENTITIES=$(node -e "const c=require('${CONFIG_PATH}'); const e=c.entities||[]; console.log(e.map(x=>x.name).join(', '))" 2>/dev/null || echo "none")
  HUMAN_LIST=$(node -e "const c=require('${CONFIG_PATH}'); const h=[c.owner]; c.entities.forEach(e=>{if(e.human)h.push(e.human)}); console.log([...new Set(h)].join(', '))" 2>/dev/null || echo "$OWNER")
  printf "  Entities:    ${B}${ENTITIES}${R}\n"
  printf "  Reporting to: ${B}${HUMAN_LIST}${R}\n\n"
fi

# Create persistent auth directory
mkdir -p "$WHATSAPP_DIR"
printf "  ${G}✓${R} Auth directory: ${WHATSAPP_DIR}\n"

# Check if auth already exists
if [ -f "$WHATSAPP_DIR/auth_info_baileys/creds.json" ]; then
  printf "  ${G}✓${R} Existing WhatsApp session found.\n"
  printf "  To re-authenticate, delete ${WHATSAPP_DIR}/auth_info_baileys/ and re-run.\n\n"
  exit 0
fi

printf "\n  WhatsApp authentication requires scanning a QR code.\n"
printf "  This will start a temporary container to generate the QR.\n\n"

# Check Docker
if ! command -v docker > /dev/null 2>&1; then
  printf "  ${Y}Error:${R} Docker is required.\n\n"
  exit 1
fi

IMAGE="personal-ai-aioo"
if ! docker image inspect "$IMAGE" > /dev/null 2>&1; then
  printf "  ${Y}Error:${R} AIOO image not built yet. Run aioo.sh first.\n\n"
  exit 1
fi

# Load environment for API key
[ -f "$REPO_DIR/.env" ] && set -a && source "$REPO_DIR/.env" && set +a

CONTAINER="whatsapp-setup-$$"

printf "  Starting WhatsApp auth container...\n"
printf "  ${D}Watch for the QR code in the logs below.${R}\n"
printf "  ${D}Scan it with WhatsApp > Linked Devices > Link a Device${R}\n\n"

# Run NanoClaw with WhatsApp channel enabled, interactive for QR
docker run --rm -it --name "$CONTAINER" \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v "$WHATSAPP_DIR:/opt/nanoclaw/data/whatsapp" \
  -e "ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY:-placeholder}" \
  -e "ASSISTANT_NAME=WhatsApp-Setup" \
  "$IMAGE"

# Check if auth was saved
if [ -f "$WHATSAPP_DIR/auth_info_baileys/creds.json" ]; then
  printf "\n  ${G}✓${R} WhatsApp authenticated successfully!\n"
  printf "  Auth data saved to: ${WHATSAPP_DIR}\n"
  printf "  This persists across container rebuilds.\n\n"
  printf "  ${B}Next:${R} Restart your AIOO to pick up WhatsApp:\n"
  printf "  ${D}docker rm -f aioo-<entity> && ./aioo/aioo.sh <entity>${R}\n\n"
else
  printf "\n  ${Y}⚠${R} Auth data not found. QR scan may have failed.\n"
  printf "  Re-run this script to try again.\n\n"
  exit 1
fi
