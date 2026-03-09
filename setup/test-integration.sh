#!/bin/bash
# Personal AI — Integration Test
# Usage: ./test-integration.sh
# End-to-end verification of the full system.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
source "$REPO_DIR/version.sh"
VAULT_PATH="$REPO_DIR/memory-vault"

G="\033[32m" Y="\033[33m" R_="\033[31m" B="\033[1m" D="\033[2m" R="\033[0m"
W=64
LINE=$(printf '═%.0s' $(seq 1 $W))

PASS=0
FAIL=0

ok()   { printf "  ${G}✓${R} %s\n" "$1"; PASS=$((PASS+1)); }
fail() { printf "  ${R_}✗${R} %s\n" "$1"; FAIL=$((FAIL+1)); }
section() { printf "\n  ${B}── %s ──${R}\n" "$1"; }

printf "${B}${G}╔${LINE}\n"
printf "║  Personal AI v${VERSION} — Integration Test\n"
printf "╚${LINE}${R}\n"

# ── Pre-checks ────────────────────────────────────────────────────────────
section "Pre-checks"

command -v docker > /dev/null 2>&1 && ok "docker available" || { fail "docker required"; exit 1; }
[ -f "$REPO_DIR/.env" ] && ok ".env exists" || { fail ".env required — copy from .env.example"; exit 1; }

# Load env
set -a && source "$REPO_DIR/.env" && set +a

# ── Docker Network ────────────────────────────────────────────────────────
section "Docker Network"

docker network create personal-ai-net 2>/dev/null && ok "personal-ai-net created" || ok "personal-ai-net exists"

# ── Context Extractor (simple mode) ──────────────────────────────────────
section "Context Extractor"

cd "$REPO_DIR"
docker compose --profile seed up -d --build context-extractor 2>&1 | tail -3
sleep 2

if docker ps --format '{{.Names}}' | grep -q "^context-extractor$"; then
  ok "context-extractor running"
else
  fail "context-extractor not running"
fi

# Health check
CX_HEALTH=$(docker exec context-extractor curl -sf http://localhost:27125/health 2>/dev/null || echo "fail")
echo "$CX_HEALTH" | grep -q '"status"' && ok "context-extractor /health responds" || fail "context-extractor /health failed"

# ── LiteLLM Proxy ────────────────────────────────────────────────────────
section "LiteLLM Proxy"

if [ -n "${GEMINI_API_KEY:-}" ]; then
  docker compose --profile seed up -d litellm-proxy 2>&1 | tail -3
  sleep 3
  if docker ps --format '{{.Names}}' | grep -q "^litellm-proxy$"; then
    ok "litellm-proxy running"
  else
    fail "litellm-proxy not running"
  fi
else
  printf "  ${D}  Skipping LiteLLM (no GEMINI_API_KEY set)${R}\n"
fi

# ── File Drop Test ────────────────────────────────────────────────────────
section "File Drop (Raw → Distilled)"

# Find first entity
ENTITY=$(ls "$VAULT_PATH" 2>/dev/null | head -1)
if [ -z "$ENTITY" ]; then
  fail "no entity vault found — run install.sh first"
else
  TEST_FILE="$VAULT_PATH/$ENTITY/Raw/Other/integration-test-$(date +%s).md"
  printf "# Integration Test\n\nThis is an automated test note.\nCreated at $(date -Iseconds).\n" > "$TEST_FILE"
  ok "test file dropped to Raw/Other/"

  # Wait for processing
  printf "  ${D}  Waiting up to 10s for distillation...${R}\n"
  FOUND=false
  for i in $(seq 1 10); do
    if find "$VAULT_PATH/$ENTITY/Distilled" -name "*integration-test*" -newer "$TEST_FILE" 2>/dev/null | grep -q .; then
      FOUND=true
      break
    fi
    sleep 1
  done

  if [ "$FOUND" = "true" ]; then
    ok "file distilled within ${i}s"
  else
    fail "file not distilled within 10s (check context-extractor logs)"
  fi

  # Check chronicle event
  CHRONICLE="$VAULT_PATH/$ENTITY/Logs/chronicle.jsonl"
  if [ -f "$CHRONICLE" ] && grep -q "integration-test" "$CHRONICLE" 2>/dev/null; then
    ok "chronicle event logged"
  else
    printf "  ${D}  chronicle event not found (may need more time)${R}\n"
  fi
fi

# ── Image Builds ──────────────────────────────────────────────────────────
section "Agent Images"

for IMG in personal-ai-aioo personal-ai-clark; do
  if docker image inspect "$IMG" > /dev/null 2>&1; then
    ok "image $IMG exists"
  else
    printf "  ${D}  Building $IMG...${R}\n"
    DIR=$(echo "$IMG" | sed 's/personal-ai-//')
    docker build -t "$IMG" "$REPO_DIR/$DIR/" 2>&1 | tail -1 && ok "image $IMG built" || fail "image $IMG build failed"
  fi
done

# ── NanoClaw Skills ───────────────────────────────────────────────────────
section "NanoClaw Skills"

for SKILL in query-vault vault-search distill-now chronicle-log; do
  [ -f "$REPO_DIR/nanoclaw-config/skills/$SKILL/SKILL.md" ] && ok "skill: $SKILL" || fail "skill: $SKILL missing"
done

for SKILL in hybrid-router; do
  [ -f "$REPO_DIR/nanoclaw-config/aioo/skills/$SKILL/SKILL.md" ] && ok "aioo skill: $SKILL" || fail "aioo skill: $SKILL missing"
done

# ── Verify Script ─────────────────────────────────────────────────────────
section "Verify Script"

"$REPO_DIR/setup/verify.sh" > /dev/null 2>&1 && ok "verify.sh passes" || fail "verify.sh reports failures"

# ── Summary ───────────────────────────────────────────────────────────────
printf "\n${B}${G}╔${LINE}\n"
printf "║  Integration Test Complete\n"
printf "╚${LINE}${R}\n\n"
printf "  ${G}✓${R} Passed:  ${B}${PASS}${R}\n"
[ "$FAIL" -gt 0 ] && printf "  ${R_}✗${R} Failed:  ${B}${FAIL}${R}\n"
printf "\n"

[ "$FAIL" -gt 0 ] && exit 1 || exit 0
