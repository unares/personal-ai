#!/bin/bash
# Personal AI — Claude Account Selector
# Sourced by claude.sh and launcher scripts.
# Sets CLAUDE_ACCOUNT to the selected account ID.
# Copies credentials to ~/.claude/.credentials.json
#
# Requires: ACCOUNTS_STORE, node, HUMAN_NAME
# Optional: CLAUDE_ACCOUNT (pre-selected via env or --account flag)

_ACCOUNTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
_ACCOUNTS_JSON="$_ACCOUNTS_DIR/accounts.json"
_ACCOUNTS_STORE="${ACCOUNTS_STORE:-$HOME/.config/personal-ai/claude-accounts}"

G="\033[32m" Y="\033[33m" C="\033[36m" B="\033[1m" D="\033[2m" R="\033[0m"

select_account() {
  local target_claude_dir="${1:-$HOME/.claude}"

  # If CLAUDE_ACCOUNT is already set (e.g. via --account flag), use it directly
  if [ -n "${CLAUDE_ACCOUNT:-}" ]; then
    if [ -f "$_ACCOUNTS_STORE/$CLAUDE_ACCOUNT/.credentials.json" ]; then
      mkdir -p "$target_claude_dir"
      cp "$_ACCOUNTS_STORE/$CLAUDE_ACCOUNT/.credentials.json" "$target_claude_dir/.credentials.json"
      printf "  ${G}+${R} Account: ${CLAUDE_ACCOUNT} (pre-selected)\n"
      _log_session
      return 0
    else
      printf "  ${Y}Warning:${R} Account '${CLAUDE_ACCOUNT}' not authenticated. Falling back to picker.\n"
      unset CLAUDE_ACCOUNT
    fi
  fi

  # Check if accounts.json exists
  if [ ! -f "$_ACCOUNTS_JSON" ] || ! command -v node > /dev/null 2>&1; then
    printf "  ${D}No account registry found. Using current credentials.${R}\n"
    return 0
  fi

  # List accounts with auth status
  local W=64
  local LINE=$(printf '═%.0s' $(seq 1 $W))
  printf "${B}${G}╔${LINE}\n"
  printf "║  Claude Account\n"
  printf "╚${LINE}${R}\n\n"

  local i=1
  local ACCOUNT_IDS=()

  while IFS= read -r acc_line; do
    local acc_id=$(echo "$acc_line" | cut -d'|' -f1)
    local acc_label=$(echo "$acc_line" | cut -d'|' -f2)
    ACCOUNT_IDS+=("$acc_id")

    if [ -f "$_ACCOUNTS_STORE/$acc_id/.credentials.json" ]; then
      printf "  ${C}%s.${R} %-28s ${G}authenticated${R}\n" "$i" "$acc_label"
    else
      printf "  ${C}%s.${R} %-28s ${D}not yet authenticated${R}\n" "$i" "$acc_label"
    fi
    i=$((i + 1))
  done < <(node -e "
    const a = require('$_ACCOUNTS_JSON');
    a.accounts.forEach(x => console.log(x.id + '|' + x.label));
  " 2>/dev/null)

  printf "\n  ${C}N.${R} New Account (authenticate now)\n"
  printf "  ${C}S.${R} Skip (use current credentials)\n\n"

  read -rp "  Select: " ACHOICE

  case "$ACHOICE" in
    [Nn])
      printf "  ${D}Run ./accounts/setup-account.sh <account-id> to add one.${R}\n\n"
      return 0
      ;;
    [Ss])
      printf "  ${D}Using current credentials.${R}\n"
      return 0
      ;;
    *)
      if [[ "$ACHOICE" =~ ^[0-9]+$ ]] && [ "$ACHOICE" -ge 1 ] && [ "$ACHOICE" -le "${#ACCOUNT_IDS[@]}" ]; then
        local idx=$((ACHOICE - 1))
        CLAUDE_ACCOUNT="${ACCOUNT_IDS[$idx]}"

        if [ -f "$_ACCOUNTS_STORE/$CLAUDE_ACCOUNT/.credentials.json" ]; then
          mkdir -p "$target_claude_dir"
          cp "$_ACCOUNTS_STORE/$CLAUDE_ACCOUNT/.credentials.json" "$target_claude_dir/.credentials.json"
          printf "  ${G}+${R} Account: ${CLAUDE_ACCOUNT}\n"
          _log_session
        else
          printf "  ${Y}Warning:${R} Account '${CLAUDE_ACCOUNT}' not authenticated.\n"
          printf "  ${D}Run: ./accounts/setup-account.sh ${CLAUDE_ACCOUNT}${R}\n"
          printf "  ${D}Continuing with current credentials.${R}\n"
        fi
      else
        printf "  ${D}Invalid selection. Using current credentials.${R}\n"
      fi
      ;;
  esac
}

_log_session() {
  # Log session metadata to vault if mounted
  local vault_logs=""
  if [ -d "/vault/Logs" ]; then
    vault_logs="/vault/Logs"
  elif [ -n "${VAULT_PATH:-}" ] && [ -n "${ENTITY:-}" ] && [ -d "${VAULT_PATH}/${ENTITY}/Logs" ]; then
    vault_logs="${VAULT_PATH}/${ENTITY}/Logs"
  fi

  if [ -n "$vault_logs" ]; then
    local ts=$(date -u +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || date +"%Y-%m-%dT%H:%M:%SZ")
    local entry="{\"ts\":\"$ts\",\"human\":\"${HUMAN_NAME:-unknown}\",\"account\":\"${CLAUDE_ACCOUNT:-unknown}\",\"entity\":\"${ENTITY:-unknown}\",\"container\":\"$(hostname 2>/dev/null || echo unknown)\",\"profile\":\"${PROFILE_NAME:-unknown}\"}"
    echo "$entry" >> "$vault_logs/sessions.jsonl" 2>/dev/null || true
  fi
}

export CLAUDE_ACCOUNT
