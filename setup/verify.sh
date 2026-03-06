#!/bin/bash
# Personal AI — System Verification
# Usage: ./verify.sh
# Checks config, vault, Context Extractor, and running containers.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
source "$REPO_DIR/version.sh"
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
printf "║  Personal AI v${VERSION} — System Verify\n"
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
    [ "$HAS_ENTITIES_KEY" = "yes" ] && ok "config uses 'entities' key (v${VERSION})" || warn "config uses old 'projects' key — re-run ./install.sh"
  fi
fi

# ── Vault ──────────────────────────────────────────────────────────────────
section "Vault"

if [ ! -d "$VAULT_PATH" ]; then
  fail "memory-vault/ missing — run ./install.sh"
else
  ok "memory-vault/ exists"

  if command -v node > /dev/null 2>&1 && [ -f "$CONFIG_PATH" ]; then
    ENTITIES=$(node -e "const c=require('${CONFIG_PATH}'); const e=c.entities||c.projects||[]; console.log(e.map(x=>x.name).join(' '))")
    for ENTITY in $ENTITIES; do
      ENTITY_VAULT="$VAULT_PATH/$ENTITY"
      if [ ! -d "$ENTITY_VAULT" ]; then
        fail "${ENTITY}/ vault missing"
        continue
      fi
      ok "${ENTITY}/ vault exists"
      for SUBDIR in "Raw/AIOO" "Raw/Clark" "Raw/Other" "Processing" "Distilled/Clark" "Distilled/AIOO" "Distilled/shared" "Distilled/personal-story" "Distilled/Archive" "Bin" "Logs"; do
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

  # Docker network
  if docker network inspect personal-ai-net > /dev/null 2>&1; then
    ok "personal-ai-net network exists"
  else
    warn "personal-ai-net network missing — run: docker network create personal-ai-net"
  fi

  # Context Extractor
  if docker ps --format '{{.Names}}' 2>/dev/null | grep -q "^context-extractor$"; then
    ok "context-extractor running"
    # Check CX mode
    CX_MODE=$(docker exec context-extractor sh -c 'echo $CX_MODE' 2>/dev/null || echo "unknown")
    [ "$CX_MODE" = "simple" ] && ok "context-extractor mode: simple" || printf "  ${D}  context-extractor mode: ${CX_MODE}${R}\n"
  else
    warn "context-extractor not running — start with: docker compose --profile seed up -d"
  fi

  # LiteLLM Proxy
  if docker ps --format '{{.Names}}' 2>/dev/null | grep -q "^litellm-proxy$"; then
    ok "litellm-proxy running"
  else
    printf "  ${D}  litellm-proxy not running (optional — for hybrid LLM routing)${R}\n"
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

  # Network connectivity — check containers are on personal-ai-net
  for CNAME in context-extractor litellm-proxy; do
    if docker ps --format '{{.Names}}' 2>/dev/null | grep -q "^${CNAME}$"; then
      ON_NET=$(docker inspect "$CNAME" --format '{{range $k,$v := .NetworkSettings.Networks}}{{$k}} {{end}}' 2>/dev/null)
      echo "$ON_NET" | grep -q "personal-ai-net" && ok "${CNAME} on personal-ai-net" || warn "${CNAME} not on personal-ai-net"
    fi
  done
fi

# ── GitHub ─────────────────────────────────────────────────────────────────
section "GitHub"

if command -v node > /dev/null 2>&1 && [ -f "$CONFIG_PATH" ]; then
  ENTITIES=$(node -e "const c=require('${CONFIG_PATH}'); const e=c.entities||c.projects||[]; console.log(e.map(x=>x.name).join(' '))")
  HAS_GH=false
  for ENTITY in $ENTITIES; do
    GH_REPO=$(node -e "const c=require('${CONFIG_PATH}'); const e=(c.entities||[]).find(x=>x.name==='${ENTITY}'); if(e&&e.github) console.log(e.github.repo); else console.log('')" 2>/dev/null) || true
    if [ -z "$GH_REPO" ]; then
      printf "  ${D}  ${ENTITY}: no GitHub repo configured${R}\n"
      continue
    fi
    HAS_GH=true

    # Test connection
    GH_OK=false
    GH_DETAILS=""

    if command -v gh > /dev/null 2>&1; then
      GH_RESULT=$(gh api "repos/${GH_REPO}" --jq '[.private, .default_branch, (.size // 0)] | @tsv' 2>/dev/null) && GH_OK=true || true
    fi

    if ! $GH_OK; then
      GH_TOKEN=""
      [ -f "$REPO_DIR/.env" ] && GH_TOKEN=$(grep -E "^GITHUB_TOKEN=" "$REPO_DIR/.env" 2>/dev/null | cut -d'=' -f2- | tr -d "'\"" || true)
      if [ -n "$GH_TOKEN" ]; then
        GH_RESULT=$(curl -sf -H "Authorization: token ${GH_TOKEN}" "https://api.github.com/repos/${GH_REPO}" 2>/dev/null | node -e "const d=require('fs').readFileSync('/dev/stdin','utf8'); const j=JSON.parse(d); console.log([j.private,j.default_branch,j.size||0].join('\t'))" 2>/dev/null) && GH_OK=true || true
      else
        GH_RESULT=$(curl -sf "https://api.github.com/repos/${GH_REPO}" 2>/dev/null | node -e "const d=require('fs').readFileSync('/dev/stdin','utf8'); const j=JSON.parse(d); console.log([j.private,j.default_branch,j.size||0].join('\t'))" 2>/dev/null) && GH_OK=true || true
      fi
    fi

    if $GH_OK && [ -n "$GH_RESULT" ]; then
      GH_PRIVATE=$(echo "$GH_RESULT" | cut -f1)
      GH_BRANCH=$(echo "$GH_RESULT" | cut -f2)
      GH_VIS="public"; [ "$GH_PRIVATE" = "true" ] && GH_VIS="private"
      ok "${ENTITY}: ${GH_REPO} (${GH_VIS}, branch: ${GH_BRANCH})"
    else
      fail "${ENTITY}: ${GH_REPO} — not reachable (check GITHUB_TOKEN in .env)"
    fi
  done
  if ! $HAS_GH; then
    printf "  ${D}  No entities have GitHub repos configured${R}\n"
  fi
else
  printf "  ${D}  Skipped — node or config.json not available${R}\n"
fi

# ── pai-launch ──────────────────────────────────────────────────────────
section "Launcher"

[ -f "$REPO_DIR/pai-launch" ] && [ -x "$REPO_DIR/pai-launch" ] && ok "pai-launch (executable)" || warn "pai-launch missing or not executable"

# ── NanoClaw Config ──────────────────────────────────────────────────────
section "NanoClaw Config"

for CFG in nanoclaw-config/aioo/CLAUDE.md nanoclaw-config/clark/CLAUDE.md; do
  [ -f "$REPO_DIR/$CFG" ] && ok "$CFG" || warn "$CFG missing"
done

for SKILL_DIR in nanoclaw-config/skills/query-vault nanoclaw-config/skills/vault-search nanoclaw-config/skills/distill-now nanoclaw-config/skills/chronicle-log nanoclaw-config/aioo/skills/hybrid-router nanoclaw-config/aioo/skills/spawn-app-builder; do
  [ -f "$REPO_DIR/$SKILL_DIR/SKILL.md" ] && ok "$SKILL_DIR/SKILL.md" || warn "$SKILL_DIR/SKILL.md missing"
done

# ── Environment ──────────────────────────────────────────────────────────
section "Environment"

if [ -f "$REPO_DIR/.env" ]; then
  ok ".env file exists"
  grep -q "ANTHROPIC_API_KEY" "$REPO_DIR/.env" && ok "ANTHROPIC_API_KEY configured" || warn "ANTHROPIC_API_KEY not set in .env"
  grep -q "GEMINI_API_KEY" "$REPO_DIR/.env" && ok "GEMINI_API_KEY configured (hybrid routing)" || printf "  ${D}  GEMINI_API_KEY not set (hybrid routing disabled)${R}\n"
else
  warn ".env file missing — copy from .env.example"
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
