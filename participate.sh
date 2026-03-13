#!/bin/bash
# Personal AI Workspace — Claude Code Launcher
# Usage: ./participate.sh [--technical | --non-technical | --help]
# The single entry point for launching Claude Code in any entity context.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/version.sh"

PROFILES_DIR="$SCRIPT_DIR/profiles"
ACCOUNTS_DIR="$SCRIPT_DIR/accounts"
CONFIG="$SCRIPT_DIR/config.json"
CLAUDE_FLAGS="--dangerously-skip-permissions"

G="\033[32m" Y="\033[33m" C="\033[36m" B="\033[1m" D="\033[2m" R="\033[0m"
W=64
LINE=$(printf '═%.0s' $(seq 1 $W))

# ── Detect context ─────────────────────────────────────────────────────────

# HUMAN_NAME: env → config.json owner (capitalized) → git → whoami
if [ -z "${HUMAN_NAME:-}" ]; then
  if [ -f "$CONFIG" ] && command -v node > /dev/null 2>&1; then
    _owner=$(node -e "
      const c=require('$CONFIG');
      const o=c.owner||'';
      console.log(o.charAt(0).toUpperCase()+o.slice(1));
    " 2>/dev/null)
    HUMAN_NAME="${_owner:-$(git config user.name 2>/dev/null || whoami)}"
  else
    HUMAN_NAME=$(git config user.name 2>/dev/null || whoami)
  fi
fi

# ENTITY: env → config.json default (first solo entity or ai-workspace)
if [ -z "${ENTITY:-}" ]; then
  if [ -f "$CONFIG" ] && command -v node > /dev/null 2>&1; then
    ENTITY=$(node -e "
      const c=require('$CONFIG');
      const solo=(c.entities||[]).find(e=>e.solo);
      console.log(solo?solo.name:'ai-workspace');
    " 2>/dev/null || echo "ai-workspace")
  else
    ENTITY="ai-workspace"
  fi
fi

# In containers: override with container env if set
if [ -f "/.dockerenv" ]; then
  ENTITY="${ENTITY:-unknown}"
  HUMAN_NAME="${HUMAN_NAME:-unknown}"
fi

ROLE="${ROLE:-technical}"
ROLE_LABEL="${ROLE_LABEL:-$ROLE}"
CONTAINER="${CONTAINER:-$(hostname 2>/dev/null || echo host)}"

export HUMAN_NAME ENTITY ROLE ROLE_LABEL

# ── Parse flags ────────────────────────────────────────────────────────────

PROFILE_FLAG=""
case "${1:-}" in
  --technical)      PROFILE_FLAG="technical" ;;
  --non-technical)  PROFILE_FLAG="non-technical" ;;
  --help|-h)
    printf "\n  ${B}Personal AI Workspace v${VERSION} — Claude Code${R}\n\n"
    printf "  ${B}Usage:${R}\n"
    printf "    ./participate.sh                  Interactive profile selection\n"
    printf "    ./participate.sh --technical      Full access (Michal)\n"
    printf "    ./participate.sh --non-technical  Co-founder access (Mateusz, Andras)\n\n"
    exit 0
    ;;
  "")
    # interactive — continue
    ;;
  *)
    printf "  ${Y}Unknown flag:${R} $1\n"
    printf "  Run ./participate.sh --help for usage.\n\n"
    exit 1
    ;;
esac

# ── Banner ─────────────────────────────────────────────────────────────────

clear
printf "\n${B}${G}╔${LINE}\n"
printf "║  Personal AI Workspace v${VERSION} — Claude Code\n"
printf "║  Human: ${HUMAN_NAME}  |  Entity: ${ENTITY}\n"
printf "╚${LINE}${R}\n\n"

# ── Vault access summary ───────────────────────────────────────────────────

VAULT_PATH=""
if [ -f "$CONFIG" ] && command -v node > /dev/null 2>&1; then
  VAULT_PATH=$(node -e "const c=require('$CONFIG'); console.log(c.vaultPath||'')" 2>/dev/null)
fi
VAULT_PATH="${VAULT_PATH:-/vault}"

ENTITY_VAULT="${VAULT_PATH}/${ENTITY}"
if [ -d "$ENTITY_VAULT" ]; then
  printf "  ${B}Vault:${R} ${ENTITY_VAULT}\n"
  for VDIR in "$ENTITY_VAULT" "$ENTITY_VAULT/Distilled" "$ENTITY_VAULT/Raw" "$ENTITY_VAULT/Logs"; do
    [ ! -d "$VDIR" ] && continue
    VNAME="${VDIR#$ENTITY_VAULT}"
    [ -z "$VNAME" ] && VNAME="/"
    if [ -w "$VDIR" ]; then
      printf "    %-32s ${G}read-write${R}\n" "${ENTITY}${VNAME}"
    else
      printf "    %-32s ${D}read-only${R}\n" "${ENTITY}${VNAME}"
    fi
  done
  # NORTHSTAR
  NS=$(find "$ENTITY_VAULT" -maxdepth 1 -name "*NORTHSTAR*" 2>/dev/null | head -1)
  if [ -n "$NS" ]; then
    NS_NAME=$(basename "$NS")
    NS_LABEL="${NS_NAME%.*}"
    if [ -w "$NS" ]; then
      printf "    %-32s ${G}read-write${R}\n" "$NS_LABEL"
    else
      printf "    %-32s ${D}read-only${R}\n" "$NS_LABEL"
    fi
  fi
  printf "\n"
fi

# ── GitHub status ──────────────────────────────────────────────────────────

GH_REPO=""
if [ -f "$CONFIG" ] && command -v node > /dev/null 2>&1; then
  GH_REPO=$(node -e "
    const c=require('$CONFIG');
    const e=(c.entities||[]).find(x=>x.name==='${ENTITY}');
    console.log(e&&e.github?e.github.repo:'');
  " 2>/dev/null) || true
fi
if [ -z "$GH_REPO" ] && command -v git > /dev/null 2>&1; then
  REMOTE=$(git -C "$SCRIPT_DIR" remote get-url origin 2>/dev/null || echo "")
  [ -n "$REMOTE" ] && GH_REPO=$(echo "$REMOTE" | sed -E 's|https://github.com/||;s|git@github.com:||;s|\.git$||')
fi

if [ -n "$GH_REPO" ]; then
  printf "  ${B}GitHub:${R} "
  GH_OK=false
  command -v gh > /dev/null 2>&1 && gh api "repos/${GH_REPO}" --jq '.full_name' > /dev/null 2>&1 && GH_OK=true || true
  if $GH_OK; then
    printf "${G}✓${R} ${GH_REPO}\n\n"
  else
    printf "${Y}✗${R} ${GH_REPO} (not reachable)\n\n"
  fi
fi

# ── Profile selection ──────────────────────────────────────────────────────

SELECTED_PROFILE=""
SELECTED_PROFILE_DIR=""

_activate_profile() {
  local name="$1"
  local dir="$PROFILES_DIR/$name"

  if [ ! -d "$dir" ] || [ ! -f "$dir/profile.json" ]; then
    printf "  ${Y}Error:${R} Profile '${name}' not found in ${PROFILES_DIR}/\n\n"
    exit 1
  fi

  # Inject identity into settings.json and write to ~/.claude/
  if [ -f "$dir/settings.json" ] && command -v node > /dev/null 2>&1; then
    mkdir -p "$HOME/.claude"
    node -e "
      const fs = require('fs');
      const s = JSON.parse(fs.readFileSync('$dir/settings.json','utf8'));
      s.env = s.env || {};
      s.env.HUMAN_NAME = '$HUMAN_NAME';
      s.env.ENTITY = '$ENTITY';
      if (!s.env.ROLE) s.env.ROLE = '$ROLE';
      if (!s.env.ENABLE_LSP_TOOL) s.env.ENABLE_LSP_TOOL = '1';
      fs.writeFileSync('$HOME/.claude/settings.json', JSON.stringify(s, null, 2) + '\n');
    " 2>/dev/null || cp "$dir/settings.json" "$HOME/.claude/settings.json"
  fi

  # Non-technical: restrict to app-workspaces/ only (not allowed from workspace root)
  if [ "$name" = "non-technical" ] && [ ! -f "/.dockerenv" ]; then
    local cwd; cwd="$(pwd)"
    case "$cwd" in
      */app-workspaces/*) ;;
      *)
        printf "  ${Y}Restricted:${R} Non-technical profile can only be launched from an app-workspaces/ directory.\n\n"
        exit 1
        ;;
    esac
  fi

  # Inject profile CLAUDE.md as global identity
  if [ -f "$dir/CLAUDE.md" ]; then
    cp "$dir/CLAUDE.md" "$HOME/.claude/CLAUDE.md"
  fi

  SELECTED_PROFILE="$name"
  SELECTED_PROFILE_DIR="$dir"
  export PROFILE_NAME="$name"

  local label
  label=$(node -e "const p=require('$dir/profile.json'); console.log(p.label)" 2>/dev/null || echo "$name")
  printf "  ${G}✓${R} Profile: ${B}${label}${R}  (human: ${HUMAN_NAME}, entity: ${ENTITY})\n\n"
}

_activate_container_profile() {
  local role="${ROLE:-technical}"
  local template="/vault/ai-workspace/Claude/Templates/Profiles/${role}.md"

  if [ ! -f "$template" ]; then
    printf "  ${Y}Error:${R} Profile template not found: ${template}\n"
    printf "  Expected at: /vault/ai-workspace/Claude/Templates/Profiles/${role}.md\n\n"
    exit 1
  fi

  mkdir -p "$HOME/.claude"
  cp "$template" "$HOME/.claude/CLAUDE.md"

  SELECTED_PROFILE="$role"
  export PROFILE_NAME="$role"
  printf "  ${G}✓${R} Profile: ${B}${role}${R}  (human: ${HUMAN_NAME}, entity: ${ENTITY}, container mode)\n\n"
}

if [ -f "/.dockerenv" ]; then
  # Container mode — read profile template from vault, skip profiles/ dir
  _activate_container_profile
elif [ -n "$PROFILE_FLAG" ]; then
  # Direct flag — skip interactive picker
  _activate_profile "$PROFILE_FLAG"
elif [ -d "$PROFILES_DIR" ] && command -v node > /dev/null 2>&1; then
  # Interactive profile picker
  printf "  ${B}Profiles:${R}\n"

  PIDX=1
  PDIRS=()
  PNAMES=()

  for PJ in "$PROFILES_DIR"/*/profile.json; do
    [ -f "$PJ" ] || continue
    PNAME=$(node -e "const p=require('${PJ}'); console.log(p.name)" 2>/dev/null) || continue
    PLABEL=$(node -e "const p=require('${PJ}'); console.log(p.label)" 2>/dev/null) || continue
    PDESC=$(node -e "const p=require('${PJ}'); console.log(p.description||'')" 2>/dev/null) || continue
    PCAPS=$(node -e "
      const p=require('${PJ}');
      const c=p.capabilities||{};
      const parts=[];
      if(c.vault) parts.push('vault:'+c.vault);
      if(c.push) parts.push('push:✓'); else parts.push('push:✗');
      if(c.docker) parts.push('docker:✓'); else parts.push('docker:✗');
      if(c.web) parts.push('web:✓');
      console.log(parts.join(' | '));
    " 2>/dev/null) || PCAPS=""

    # skip _standard
    [ "$PNAME" = "_standard" ] && continue

    PDIRS+=("$(dirname "$PJ")")
    PNAMES+=("$PNAME")
    printf "    ${C}%s.${R} %-18s ${D}%s${R}\n" "$PIDX" "$PLABEL" "$PDESC"
    [ -n "$PCAPS" ] && printf "       %-18s ${D}%s${R}\n" "" "$PCAPS"
    PIDX=$((PIDX + 1))
  done
  printf "\n"

  read -rp "  Select profile [1-$((PIDX - 1))]: " PCHOICE

  if [[ "$PCHOICE" =~ ^[0-9]+$ ]] && [ "$PCHOICE" -ge 1 ] && [ "$PCHOICE" -le "${#PNAMES[@]}" ]; then
    _activate_profile "${PNAMES[$((PCHOICE - 1))]}"
  else
    printf "  ${Y}Invalid selection. Exiting.${R}\n\n"
    exit 1
  fi
fi

# ── Account selection ──────────────────────────────────────────────────────

  # if [ -f "$ACCOUNTS_DIR/select-account.sh" ]; then
  #   ACCOUNTS_STORE="${ACCOUNTS_STORE:-$HOME/.config/personal-ai/claude-accounts}"
  #   export ACCOUNTS_STORE
  #   source "$ACCOUNTS_DIR/select-account.sh"
  #   select_account "$HOME/.claude"
  #   printf "\n"
  # fi

# ── Context sync staleness warning ─────────────────────────────────────────

_check_context_sync() {
  local sync_state="${VAULT_PATH}/${ENTITY}/Logs/.context-sync-last"
  [ ! -f "$sync_state" ] && return
  local last_ts; last_ts=$(cat "$sync_state" 2>/dev/null)
  [ -z "$last_ts" ] && return
  local now; now=$(date +%s 2>/dev/null) || return
  local last; last=$(date -j -f "%Y-%m-%dT%H:%M:%SZ" "$last_ts" +%s 2>/dev/null || date -d "$last_ts" +%s 2>/dev/null) || return
  local age_h; age_h=$(( (now - last) / 3600 ))
  [ "$age_h" -ge 24 ] && printf "  ${Y}!${R} Context last synced ${age_h}h ago. Run ${B}setup/context-sync.sh --sync ${ENTITY}${R} to refresh.\n\n"
}
_check_context_sync 2>/dev/null || true

# ── Log launch ─────────────────────────────────────────────────────────────

_log_launch() {
  local logs_dir="${VAULT_PATH}/${ENTITY}/Logs"
  [ ! -d "$logs_dir" ] && return
  local ts; ts=$(date -u +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || date +"%Y-%m-%dT%H:%M:%SZ")
  echo "{\"ts\":\"$ts\",\"event\":\"launch\",\"human\":\"${HUMAN_NAME}\",\"entity\":\"${ENTITY}\",\"role\":\"${ROLE}\",\"container\":\"${CONTAINER}\",\"profile\":\"${SELECTED_PROFILE}\"}" \
    >> "$logs_dir/sessions.jsonl" 2>/dev/null || true
}
_log_launch

# ── Sync auto-memory to vault ──────────────────────────────────────────────

if [ -f "$SCRIPT_DIR/setup/sync-memory.sh" ]; then
  bash "$SCRIPT_DIR/setup/sync-memory.sh" 2>/dev/null || true
fi

# ── Launch ─────────────────────────────────────────────────────────────────

printf "  ${D}Launching Claude Code...${R}\n\n"
exec claude $CLAUDE_FLAGS
