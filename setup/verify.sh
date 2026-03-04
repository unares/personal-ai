#!/bin/bash
# Personal AI v0.2 — System Verification
# Usage: ./verify.sh
# Checks config, vault, Context Extractor, and running containers.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
VAULT_PATH="$REPO_DIR/memory-vault"
CONFIG_PATH="$REPO_DIR/config.json"

G="\033[32m" Y="\033[33m" R_="\033[31m" B="\033[1m" D="\033[2m" R="\033[0m"
W=64
LINE=$(printf '═%.0s' $(seq 1 $W))

PASS=0
FAIL=0
WARN=0

ok()   { printf "  ${G}✓${R} %s\n" "$1"; PASS=$((PASS+1)); }
fail() { printf "  ${R_}✗${R} %s\n" "$1"; FAIL=$((FAIL+1)); }
warn() { printf "  ${Y}!${R} %s\n" "$1"; WARN=$((WARN+1)); }
section() { printf "\n  ${B}── %s ──${R}\n" "$1"; }

clear
printf "${B}${G}╔${LINE}\n"
printf "║  Personal AI v0.2 — System Verify\n"
printf "╚${LINE}${R}\n\n"

# ── Config ─────────────────────────────────────────────────────────────────
section "Config"

if [ ! -f "$CONFIG_PATH" ]; then
  fail "config.json missing — run ./install.sh"
else
  ok "config.json exists"
  if ! command -v node > /dev/null 2>&1; then
    warn "node not found — skipping JSON validation"
  else
    OWNER=$(node -e "const c=require('${CONFIG_PATH}'); console.log(c.owner)" 2>/dev/null) && ok "owner: ${OWNER}" || fail "config.json: missing owner"
    ENTITY_COUNT=$(node -e "const c=require('${CONFIG_PATH}'); const e=c.entities||c.projects||[]; console.log(e.length)" 2>/dev/null)
    [ "$ENTITY_COUNT" -gt 0 ] && ok "entities: ${ENTITY_COUNT} registered" || fail "config.json: no entities found"
    CLARK_COUNT=$(node -e "const c=require('${CONFIG_PATH}'); console.log((c.clarks||[]).length)" 2>/dev/null)
    [ "$CLARK_COUNT" -gt 0 ] && ok "clarks: ${CLARK_COUNT} registered" || warn "config.json: no clarks found"
    HAS_ENTITIES_KEY=$(node -e "const c=require('${CONFIG_PATH}'); console.log(c.entities ? 'yes' : 'no')" 2>/dev/null)
    [ "$HAS_ENTITIES_KEY" = "yes" ] && ok "config uses 'entities' key (v0.2)" || warn "config uses old 'projects' key — re-run ./install.sh"
  fi
fi

# ── Vault ──────────────────────────────────────────────────────────────────
section "Vault"

if [ ! -d "$VAULT_PATH" ]; then
  fail "memory-vault/ missing — run ./install.sh"
else
  ok "memory-vault/ exists"
  [ -d "$VAULT_PATH/Logs" ] && ok "Logs/ exists" || fail "memory-vault/Logs/ missing"

  if command -v node > /dev/null 2>&1 && [ -f "$CONFIG_PATH" ]; then
    ENTITIES=$(node -e "const c=require('${CONFIG_PATH}'); const e=c.entities||c.projects||[]; console.log(e.map(x=>x.name).join(' '))")
    for ENTITY in $ENTITIES; do
      ENTITY_VAULT="$VAULT_PATH/$ENTITY"
      if [ ! -d "$ENTITY_VAULT" ]; then
        fail "${ENTITY}/ vault missing"
        continue
      fi
      ok "${ENTITY}/ vault exists"
      for SUBDIR in "Raw/Daily" "Raw/Apps" "Raw/People" "Distilled/Clark" "Distilled/AIOO" "Archive/Raw" "Logs"; do
        [ -d "$ENTITY_VAULT/$SUBDIR" ] || fail "${ENTITY}/${SUBDIR}/ missing"
      done
      NS=$(find "$ENTITY_VAULT" -maxdepth 1 -name "*_NORTHSTAR.md" 2>/dev/null | head -1)
      [ -n "$NS" ] && ok "${ENTITY}/$(basename "$NS") exists" || warn "${ENTITY}/ has no NORTHSTAR.md"
    done
  fi
fi

# ── Scripts ────────────────────────────────────────────────────────────────
section "Scripts"

for SCRIPT in setup/install.sh setup/verify.sh setup/add-entity.sh setup/add-human.sh clark/clark.sh aioo/aioo.sh app-builder/app-builder.sh; do
  if [ -f "$REPO_DIR/$SCRIPT" ]; then
    [ -x "$REPO_DIR/$SCRIPT" ] && ok "${SCRIPT} (executable)" || warn "${SCRIPT} exists but not executable — run: chmod +x ${SCRIPT}"
  else
    fail "${SCRIPT} missing"
  fi
done

for DIR in clark aioo app-builder context-extractor; do
  [ -d "$REPO_DIR/$DIR" ] && ok "${DIR}/ exists" || fail "${DIR}/ missing"
done

# ── Docker ─────────────────────────────────────────────────────────────────
section "Docker"

if ! command -v docker > /dev/null 2>&1; then
  fail "docker not found"
else
  ok "docker available"

  # Context Extractor
  if docker ps --format '{{.Names}}' 2>/dev/null | grep -q "^context-extractor$"; then
    ok "context-extractor running"
  else
    warn "context-extractor not running — start with: docker compose --profile seed up -d"
  fi

  # Clark containers
  if command -v node > /dev/null 2>&1 && [ -f "$CONFIG_PATH" ]; then
    CLARKS=$(node -e "const c=require('${CONFIG_PATH}'); console.log((c.clarks||[]).map(x=>x.name).join(' '))")
    for CLARK in $CLARKS; do
      docker ps --format '{{.Names}}' 2>/dev/null | grep -q "^${CLARK}$" && ok "${CLARK} running" || printf "  ${D}  ${CLARK} not running (start with: ./clark.sh)${R}\n"
    done

    # AIOO containers
    ENTITIES=$(node -e "const c=require('${CONFIG_PATH}'); const e=c.entities||c.projects||[]; console.log(e.map(x=>x.aioo).join(' '))")
    for AIOO in $ENTITIES; do
      docker ps --format '{{.Names}}' 2>/dev/null | grep -q "^${AIOO}$" && ok "${AIOO} running" || printf "  ${D}  ${AIOO} not running (start with: ./aioo.sh <entity>)${R}\n"
    done
  fi

  # Docker images
  for IMG in personal-ai-clark personal-ai-aioo personal-ai-app-builder; do
    docker image inspect "$IMG" > /dev/null 2>&1 && ok "image ${IMG}" || printf "  ${D}  image ${IMG} not built yet${R}\n"
  done
fi

# ── Summary ────────────────────────────────────────────────────────────────
printf "\n${B}${G}╔${LINE}\n"
printf "║  Verify complete.\n"
printf "╚${LINE}${R}\n\n"
printf "  ${G}✓${R} Passed:  ${B}${PASS}${R}\n"
[ "$WARN" -gt 0 ] && printf "  ${Y}!${R} Warnings: ${B}${WARN}${R}\n"
[ "$FAIL" -gt 0 ] && printf "  ${R_}✗${R} Failed:  ${B}${FAIL}${R}\n"
printf "\n"

[ "$FAIL" -gt 0 ] && exit 1 || exit 0
