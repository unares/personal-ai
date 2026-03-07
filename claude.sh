#!/bin/bash
# Personal AI — Claude Code Profile Launcher
# Usage: ./claude.sh [--inspect <profile>] [--add] [<profile>]
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/version.sh"
PROFILES_DIR="$SCRIPT_DIR/profiles"
ACCOUNTS_DIR="$SCRIPT_DIR/accounts"
CLAUDE_FLAGS="--dangerously-skip-permissions"

# ── Detect human identity ────────────────────────────────────
# Set HUMAN_NAME from env, git config, or system user
if [ -z "${HUMAN_NAME:-}" ]; then
  HUMAN_NAME=$(git config user.name 2>/dev/null || whoami)
fi
export HUMAN_NAME

G="\033[32m" Y="\033[33m" C="\033[36m" B="\033[1m" D="\033[2m" R="\033[0m"
W=64
LINE=$(printf '═%.0s' $(seq 1 $W))

# ── Banner ────────────────────────────────────────────────────
banner() {
  printf "${B}${G}╔${LINE}\n"
  printf "║  Personal AI v${VERSION} — Claude Code\n"
  printf "║  Human: ${HUMAN_NAME}  |  Select a profile.\n"
  printf "╚${LINE}${R}\n\n"
}

# ── List available profiles ───────────────────────────────────
list_profiles() {
  local i=1
  PROFILE_NAMES=()
  for dir in "$PROFILES_DIR"/*/; do
    [ ! -f "$dir/profile.json" ] && continue
    local name=$(basename "$dir")
    [ "$name" = "_standard" ] && continue
    PROFILE_NAMES+=("$name")

    if command -v node > /dev/null 2>&1; then
      local label=$(node -e "const p=require('$dir/profile.json'); console.log(p.label)" 2>/dev/null || echo "$name")
      local desc=$(node -e "const p=require('$dir/profile.json'); console.log(p.description)" 2>/dev/null || echo "")
      local icon=$(node -e "const p=require('$dir/profile.json'); console.log(p.icon||'')" 2>/dev/null || echo "")
      local caps=$(node -e "
        const p=require('$dir/profile.json');
        const c=p.capabilities||{};
        const v=c.vault||'none';
        const push=c.push?'✓':'✗';
        const docker=c.docker?'✓':'✗';
        const web=c.web?'✓':'✗';
        const log=c.decision_log?'✓':'✗';
        console.log('vault: '+v+' | push: '+push+' | docker: '+docker+' | web: '+web+' | log: '+log);
      " 2>/dev/null || echo "")
    else
      local label="$name"
      local desc=""
      local icon=""
      local caps=""
    fi

    printf "  ${C}%s.${R} %-16s ${D}%s${R}\n" "$i" "$label" "$desc"
    [ -n "$caps" ] && printf "     %-16s ${D}%s${R}\n" "" "$caps"
    i=$((i + 1))
  done
}

# ── Inspect a profile ─────────────────────────────────────────
inspect_profile() {
  local name="$1"
  local dir="$PROFILES_DIR/$name"

  if [ ! -d "$dir" ] || [ ! -f "$dir/profile.json" ]; then
    printf "  ${Y}Error:${R} Profile '${name}' not found.\n\n"
    exit 1
  fi

  if command -v node > /dev/null 2>&1; then
    local label=$(node -e "const p=require('$dir/profile.json'); console.log(p.label)" 2>/dev/null || echo "$name")
    local desc=$(node -e "const p=require('$dir/profile.json'); console.log(p.description)" 2>/dev/null || echo "")
  else
    local label="$name"
    local desc=""
  fi

  printf "${B}${G}╔${LINE}\n"
  printf "║  Profile: ${label}\n"
  printf "║  ${desc}\n"
  printf "╚${LINE}${R}\n\n"

  printf "  ${B}Mode:${R} Autonomous (--dangerously-skip-permissions)\n"
  printf "  ${B}Human:${R} ${HUMAN_NAME} (from git config / env)\n\n"

  if [ "$name" = "vanilla" ]; then
    printf "  ${D}Vanilla — stock Claude Code, no custom settings.${R}\n"
    printf "  ${D}Vault: none  |  Northstar: none  |  Entity context: none${R}\n\n"
    return
  fi

  # Vault access summary from CLAUDE.md
  if [ -f "$dir/CLAUDE.md" ]; then
    local vault_line=$(grep -i 'vault access' "$dir/CLAUDE.md" | head -1 | sed 's/^.*\*\*Vault access\*\*: //' | sed 's/^- //')
    if [ -n "$vault_line" ]; then
      printf "  ${B}Vault:${R} %s\n" "$vault_line"
    fi
  fi

  # Settings diff
  if [ -f "$dir/settings.json" ] && command -v node > /dev/null 2>&1; then
    printf "\n  ${B}Settings (vs. vanilla):${R}\n"
    node -e "
      const s = require('$dir/settings.json');
      if (s.env) {
        for (const [k,v] of Object.entries(s.env)) {
          console.log('    + env.' + k + ': ' + v);
        }
      }
      if (s.permissions && s.permissions.allow) {
        console.log('    + permissions.allow: ' + s.permissions.allow.length + ' rules');
      }
      if (s.permissions && s.permissions.deny) {
        console.log('    + permissions.deny: ' + s.permissions.deny.length + ' rules');
      }
      if (s.spinnerTipsOverride && s.spinnerTipsOverride.tips) {
        console.log('    + spinnerTips: ' + s.spinnerTipsOverride.tips.length + ' custom (defaults hidden)');
      }
    " 2>/dev/null || printf "    ${D}(could not parse settings.json)${R}\n"
  else
    printf "  ${D}No custom settings.json${R}\n"
  fi

  # CLAUDE.md info
  if [ -f "$dir/CLAUDE.md" ]; then
    local custom_lines=$(wc -l < "$dir/CLAUDE.md" | tr -d ' ')
    local standard_lines=0
    [ -f "$PROFILES_DIR/_standard/STANDARD.md" ] && standard_lines=$(wc -l < "$PROFILES_DIR/_standard/STANDARD.md" | tr -d ' ')

    printf "\n  ${B}CLAUDE.md:${R} %s lines custom + %s lines standard\n" "$custom_lines" "$standard_lines"

    # Show custom sections
    local sections=$(grep '^## ' "$dir/CLAUDE.md" | sed 's/^## /    /' | head -10)
    if [ -n "$sections" ]; then
      printf "    ${D}Custom sections:${R}\n"
      echo "$sections" | while read -r s; do printf "    ${C}>${R}%s\n" "$s"; done
    fi
  else
    printf "\n  ${D}No custom CLAUDE.md${R}\n"
  fi

  # Skills
  local skill_count=0
  if [ -d "$dir/skills" ]; then
    skill_count=$(find "$dir/skills" -name '*.md' ! -name 'README.md' 2>/dev/null | wc -l | tr -d ' ')
  fi
  if [ "$skill_count" -gt 0 ]; then
    printf "\n  ${B}Skills:${R} %s loaded\n" "$skill_count"
  else
    printf "\n  ${D}Skills: (none yet)${R}\n"
  fi
  printf "\n"
}

# ── Add a profile ─────────────────────────────────────────────
add_profile() {
  printf "${B}${G}╔${LINE}\n"
  printf "║  Personal AI v${VERSION} — Add Profile\n"
  printf "╚${LINE}${R}\n\n"

  read -rp "  Profile name (lowercase, no spaces): " PNAME
  if [ -z "$PNAME" ]; then
    printf "  ${Y}Error:${R} Name cannot be empty.\n\n"
    exit 1
  fi
  if [ -d "$PROFILES_DIR/$PNAME" ]; then
    printf "  ${Y}Error:${R} Profile '${PNAME}' already exists.\n\n"
    exit 1
  fi

  read -rp "  Description: " PDESC

  mkdir -p "$PROFILES_DIR/$PNAME/skills"

  # Create profile.json
  node -e "
    const p = { name: '$PNAME', label: '$PNAME', description: '$PDESC', icon: '*', skills: [], notes: 'Custom profile' };
    require('fs').writeFileSync('$PROFILES_DIR/$PNAME/profile.json', JSON.stringify(p, null, 2) + '\n');
  " 2>/dev/null || printf '{\n  "name": "%s",\n  "label": "%s",\n  "description": "%s",\n  "icon": "*"\n}\n' "$PNAME" "$PNAME" "$PDESC" > "$PROFILES_DIR/$PNAME/profile.json"

  # Copy mercenary settings as template
  if [ -f "$PROFILES_DIR/mercenary/settings.json" ]; then
    cp "$PROFILES_DIR/mercenary/settings.json" "$PROFILES_DIR/$PNAME/settings.json"
  fi

  # Create stub CLAUDE.md
  cat > "$PROFILES_DIR/$PNAME/CLAUDE.md" << MDEOF
# ${PNAME} — Custom Profile

> Do One Thing. Earn Full Autonomy.

## Role
Describe this profile's purpose here.

## What You Do
- Define responsibilities

## What You Do NOT Do
- Define constraints

## Skills
<!-- Add skills to profiles/${PNAME}/skills/ -->
MDEOF

  # Skills placeholder
  printf "# %s Skills\n\nAdd skill .md files here.\n" "$PNAME" > "$PROFILES_DIR/$PNAME/skills/README.md"

  printf "\n  ${G}+${R} Created profiles/${PNAME}/\n"
  printf "    ${D}profile.json  - edit description and label${R}\n"
  printf "    ${D}CLAUDE.md     - paste your custom instructions${R}\n"
  printf "    ${D}settings.json - edit permissions and tips${R}\n"
  printf "    ${D}skills/       - add skill .md files later${R}\n\n"
}

# ── Activate a profile ────────────────────────────────────────
activate_profile() {
  local name="$1"
  local dir="$PROFILES_DIR/$name"

  if [ "$name" = "vanilla" ]; then
    printf "  ${G}+${R} Vanilla — launching stock Claude Code (autonomous mode).\n\n"
    export PROFILE_NAME="vanilla"
    if [ -f "$ACCOUNTS_DIR/select-account.sh" ]; then
      source "$ACCOUNTS_DIR/select-account.sh"
      select_account "$HOME/.claude"
      printf "\n"
    fi
    exec claude $CLAUDE_FLAGS
  fi

  if [ ! -d "$dir" ] || [ ! -f "$dir/profile.json" ]; then
    printf "  ${Y}Error:${R} Profile '${name}' not found.\n\n"
    exit 1
  fi

  # Assemble CLAUDE.md (custom + standard)
  local assembled=$(mktemp /tmp/claude-profile-XXXXXX)
  cat "$dir/CLAUDE.md" > "$assembled"
  if [ -f "$PROFILES_DIR/_standard/STANDARD.md" ]; then
    cat "$PROFILES_DIR/_standard/STANDARD.md" >> "$assembled"
  fi

  # Copy settings.json to ~/.claude/ and inject identity env vars
  if [ -f "$dir/settings.json" ]; then
    mkdir -p "$HOME/.claude"
    # Detect bare Mac defaults (same logic as claude-code-launch)
    local _entity _role
    if [ -f "/.dockerenv" ]; then
      _entity="${ENTITY:-unknown}"
      _role="${ROLE:-unknown}"
    else
      _entity="${ENTITY:-superentity}"
      _role="${ROLE:-superuser}"
    fi
    if command -v node > /dev/null 2>&1; then
      node -e "
        const s = JSON.parse(require('fs').readFileSync('$dir/settings.json','utf8'));
        s.env = s.env || {};
        s.env.HUMAN_NAME = '$HUMAN_NAME';
        s.env.ENTITY = '$_entity';
        if (!s.env.ROLE) s.env.ROLE = '$_role';
        require('fs').writeFileSync('$HOME/.claude/settings.json', JSON.stringify(s, null, 2) + '\n');
      " 2>/dev/null || cp "$dir/settings.json" "$HOME/.claude/settings.json"
    else
      cp "$dir/settings.json" "$HOME/.claude/settings.json"
    fi
    printf "  ${G}+${R} Settings loaded (profile: ${name}, human: ${HUMAN_NAME}, entity: ${_entity})\n"
  fi

  # Display the assembled CLAUDE.md
  if command -v node > /dev/null 2>&1; then
    local label=$(node -e "const p=require('$dir/profile.json'); console.log(p.label)" 2>/dev/null || echo "$name")
  else
    local label="$name"
  fi

  printf "  ${G}+${R} CLAUDE.md assembled (custom + standard)\n"
  printf "  ${G}+${R} Profile: ${B}${label}${R}\n\n"

  printf "${B}${G}╔${LINE}\n"
  printf "║  CLAUDE.md Preview\n"
  printf "╠${LINE}${R}\n"
  # Show first 20 lines of custom section
  head -20 "$dir/CLAUDE.md" | while IFS= read -r line; do
    printf "${G}║${R}  %s\n" "$line"
  done
  local total=$(wc -l < "$dir/CLAUDE.md" | tr -d ' ')
  if [ "$total" -gt 20 ]; then
    printf "${G}║${R}  ${D}... (%s more lines)${R}\n" "$((total - 20))"
  fi
  printf "${B}${G}╚${LINE}${R}\n\n"

  # Copy assembled CLAUDE.md to working directory
  cp "$assembled" "$PWD/CLAUDE.md" 2>/dev/null || cp "$assembled" "/tmp/CLAUDE.md"
  rm -f "$assembled"

  # Account selection
  export PROFILE_NAME="$name"
  if [ -f "$ACCOUNTS_DIR/select-account.sh" ]; then
    printf "\n"
    source "$ACCOUNTS_DIR/select-account.sh"
    select_account "$HOME/.claude"
  fi

  printf "\n  ${G}+${R} Autonomous mode enabled (--dangerously-skip-permissions)\n"
  printf "  ${D}Launching Claude Code...${R}\n\n"
  exec claude $CLAUDE_FLAGS
}

# ── Main ──────────────────────────────────────────────────────

# Handle flags
case "${1:-}" in
  --inspect)
    [ -z "${2:-}" ] && { printf "  ${Y}Usage:${R} ./claude.sh --inspect <profile>\n\n"; exit 1; }
    inspect_profile "$2"
    exit 0
    ;;
  --add)
    add_profile
    exit 0
    ;;
  --help|-h)
    printf "  ${B}Usage:${R}\n"
    printf "    ./claude.sh                  Interactive profile selection\n"
    printf "    ./claude.sh <profile>        Launch with named profile\n"
    printf "    ./claude.sh --inspect <name> Show profile details\n"
    printf "    ./claude.sh --add            Create a new profile\n\n"
    exit 0
    ;;
  "")
    # Interactive mode — continue below
    ;;
  *)
    # Direct profile name
    activate_profile "$1"
    ;;
esac

# Interactive selection
clear
banner
list_profiles
printf "\n  ${C}A.${R} Add Profile\n"
printf "  ${C}I.${R} Inspect Profile\n"
printf "\n"

read -rp "  Select: " CHOICE

case "$CHOICE" in
  [Aa])
    add_profile
    ;;
  [Ii])
    read -rp "  Profile name to inspect: " INAME
    inspect_profile "$INAME"
    ;;
  *)
    # Numeric selection
    if [[ "$CHOICE" =~ ^[0-9]+$ ]] && [ "$CHOICE" -ge 1 ] && [ "$CHOICE" -le "${#PROFILE_NAMES[@]}" ]; then
      idx=$((CHOICE - 1))
      activate_profile "${PROFILE_NAMES[$idx]}"
    else
      printf "  ${Y}Invalid selection.${R}\n\n"
      exit 1
    fi
    ;;
esac
