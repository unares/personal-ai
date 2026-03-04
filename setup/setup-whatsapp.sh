#!/bin/bash
# Personal AI v0.4 — WhatsApp Setup
# Sets up WhatsApp authentication for NanoClaw
# Usage: ./setup-whatsapp.sh
set -euo pipefail

G="\033[32m" Y="\033[33m" C="\033[36m" B="\033[1m" D="\033[2m" R="\033[0m"

WHATSAPP_DIR="$HOME/.config/personal-ai/whatsapp"

printf "\n${B}WhatsApp Setup for Personal AI${R}\n\n"

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
printf "  This will start a temporary NanoClaw container to generate the QR.\n\n"

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

CONTAINER="whatsapp-setup-$$"

printf "  Starting WhatsApp auth container...\n"
printf "  ${D}Watch for the QR code in the logs below.${R}\n"
printf "  ${D}Scan it with WhatsApp > Linked Devices > Link a Device${R}\n\n"

# Run NanoClaw with WhatsApp channel enabled, interactive for QR
docker run --rm -it --name "$CONTAINER" \
  -v "$WHATSAPP_DIR:/opt/nanoclaw/data/whatsapp" \
  -e "ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY:-placeholder}" \
  -e "ASSISTANT_NAME=WhatsApp-Setup" \
  "$IMAGE"

# Check if auth was saved
if [ -f "$WHATSAPP_DIR/auth_info_baileys/creds.json" ]; then
  printf "\n  ${G}✓${R} WhatsApp authenticated successfully!\n"
  printf "  Auth data saved to: ${WHATSAPP_DIR}\n"
  printf "  This persists across container rebuilds.\n\n"
else
  printf "\n  ${Y}⚠${R} Auth data not found. QR scan may have failed.\n"
  printf "  Re-run this script to try again.\n\n"
  exit 1
fi
