#!/bin/bash
# Host Watchdog — observe and report, never recover.
# Monitors AIOO containers + NanoClaw-PAW.
# Clark is excluded (ephemeral, PAW-managed).
# Spec: memory-vault/ai-workspace/Specifications/host-watchdog.md
set -euo pipefail

SCRIPT_DIR="${SCRIPT_DIR:-$(cd "$(dirname "$0")" && pwd)}"
PROJECT_ROOT="${PROJECT_ROOT:-$(cd "$SCRIPT_DIR/../.." && pwd)}"

STATE_FILE="${STATE_FILE:-/tmp/watchdog-state.json}"
CONFIG_FILE="${CONFIG_FILE:-${HOME}/.watchdog/config.json}"
EMERGENCY_KEY_FILE="${EMERGENCY_KEY_FILE:-${HOME}/.watchdog/emergency-api-key}"
LOG_FILE="${LOG_FILE:-${PROJECT_ROOT}/logs/watchdog.log}"
PID_FILE="${PID_FILE:-/tmp/nanoclaw-paw.pid}"
IPC_DIR="${IPC_DIR:-${PROJECT_ROOT}/ipc/watchdog/to-paw}"

FAILURE_THRESHOLD="${FAILURE_THRESHOLD:-3}"
COOLDOWN_SECONDS="${COOLDOWN_SECONDS:-900}"  # 15 minutes

MONITORED_CONTAINERS="${MONITORED_CONTAINERS:-aioo-procenteo aioo-inisio}"

# ── Logging ────────────────────────────────────────────────────────
log() {
  local msg="[$(date -u +%Y-%m-%dT%H:%M:%S+00:00)] $1"
  echo "$msg" >> "$LOG_FILE"
}

# ── State management ──────────────────────────────────────────────
init_state() {
  if [ ! -f "$STATE_FILE" ]; then
    local state="{}"
    for name in $MONITORED_CONTAINERS nanoclaw-paw; do
      state=$(echo "$state" | jq --arg n "$name" \
        '. + {($n): {"failures": 0, "lastCheck": null, "lastNotified": null}}')
    done
    echo "$state" > "$STATE_FILE"
  fi
}

read_state() {
  local name="$1"
  jq -r --arg n "$name" '.[$n] // {"failures":0,"lastCheck":null,"lastNotified":null}' "$STATE_FILE"
}

write_state() {
  local name="$1" failures="$2" last_notified="$3"
  local now
  now="$(date -u +%Y-%m-%dT%H:%M:%S+00:00)"
  local tmp="${STATE_FILE}.tmp"
  jq --arg n "$name" --argjson f "$failures" \
     --arg lc "$now" --arg ln "$last_notified" \
    '.[$n] = {"failures": $f, "lastCheck": $lc, "lastNotified": (if $ln == "null" then null else $ln end)}' \
    "$STATE_FILE" > "$tmp"
  mv "$tmp" "$STATE_FILE"
}

# ── Health checks ─────────────────────────────────────────────────
check_container() {
  local name="$1"
  local status
  status=$(docker inspect --format '{{.State.Health.Status}}' "$name" 2>/dev/null) || status="missing"
  if [ "$status" = "healthy" ]; then
    echo "healthy"
  else
    echo "unhealthy"
  fi
}

check_paw() {
  if [ -f "$PID_FILE" ]; then
    local pid
    pid=$(cat "$PID_FILE")
    if kill -0 "$pid" 2>/dev/null; then
      echo "healthy"
      return
    fi
  fi
  echo "unhealthy"
}

# ── Notifications ─────────────────────────────────────────────────
notify_via_ipc() {
  local text="$1"
  if [ ! -d "$IPC_DIR" ]; then
    return 1
  fi
  local id
  id=$(uuidgen | tr '[:upper:]' '[:lower:]')
  local now
  now="$(date -u +%Y-%m-%dT%H:%M:%S+00:00)"
  local envelope
  envelope=$(jq -n \
    --arg id "$id" \
    --arg ts "$now" \
    --arg text "$text" \
    '{
      id: $id,
      type: "human-reply",
      from: "host-watchdog",
      to: "nanoclaw-paw",
      timestamp: $ts,
      payload: {channel: "default", text: $text, hitlTier: "micro"},
      replyTo: null
    }')
  local filename="msg-${id}.json"
  local tmp_path="${IPC_DIR}/${filename}.tmp"
  local final_path="${IPC_DIR}/${filename}"
  echo "$envelope" > "$tmp_path"
  mv "$tmp_path" "$final_path"
  return 0
}

notify_via_api() {
  local text="$1"
  if [ ! -f "$EMERGENCY_KEY_FILE" ]; then
    return 1
  fi
  if [ ! -f "$CONFIG_FILE" ]; then
    return 1
  fi
  local api_key
  api_key=$(cat "$EMERGENCY_KEY_FILE")
  local provider endpoint chat_id
  provider=$(jq -r '.provider // "telegram"' "$CONFIG_FILE")
  endpoint=$(jq -r '.endpoint // ""' "$CONFIG_FILE")
  chat_id=$(jq -r '.chatId // ""' "$CONFIG_FILE")

  if [ -z "$endpoint" ] || [ -z "$chat_id" ]; then
    return 1
  fi

  case "$provider" in
    telegram)
      curl -sf -X POST "${endpoint}/bot${api_key}/sendMessage" \
        -d "chat_id=${chat_id}" \
        -d "text=${text}" \
        -d "parse_mode=Markdown" \
        --max-time 10 > /dev/null 2>&1
      ;;
    *)
      return 1
      ;;
  esac
}

send_notification() {
  local text="$1"
  # Primary: via NanoClaw-PAW IPC
  if is_paw_alive && notify_via_ipc "$text"; then
    log "notification=ipc text=\"$text\""
    return 0
  fi
  # Fallback: direct API
  if notify_via_api "$text"; then
    log "notification=api text=\"$text\""
    return 0
  fi
  # Both failed
  log "notification=failed text=\"$text\""
  return 1
}

# ── PAW alive check (reused by notification path) ─────────────────
is_paw_alive() {
  [ "$(check_paw)" = "healthy" ]
}

# ── Cooldown check ────────────────────────────────────────────────
is_in_cooldown() {
  local last_notified="$1"
  if [ "$last_notified" = "null" ] || [ -z "$last_notified" ]; then
    return 1  # not in cooldown
  fi
  local last_epoch now_epoch
  last_epoch=$(date -juf "%Y-%m-%dT%H:%M:%S+00:00" "$last_notified" "+%s" 2>/dev/null) || \
  last_epoch=$(date -d "$last_notified" "+%s" 2>/dev/null) || return 1
  now_epoch=$(date -u "+%s")
  local elapsed=$(( now_epoch - last_epoch ))
  [ "$elapsed" -lt "$COOLDOWN_SECONDS" ]
}

# ── Per-component check ───────────────────────────────────────────
check_component() {
  local name="$1"
  local status
  if [ "$name" = "nanoclaw-paw" ]; then
    status=$(check_paw)
  else
    status=$(check_container "$name")
  fi

  local state failures last_notified
  state=$(read_state "$name")
  failures=$(echo "$state" | jq -r '.failures')
  last_notified=$(echo "$state" | jq -r '.lastNotified // "null"')

  if [ "$status" = "healthy" ]; then
    if [ "$failures" -gt 0 ]; then
      log "component=$name status=healthy recovered=true"
    fi
    write_state "$name" 0 "$last_notified"
    return
  fi

  failures=$(( failures + 1 ))
  log "component=$name status=unhealthy failures=$failures"

  if [ "$failures" -lt "$FAILURE_THRESHOLD" ]; then
    write_state "$name" "$failures" "$last_notified"
    return
  fi

  if is_in_cooldown "$last_notified"; then
    log "component=$name notification=suppressed cooldown=active"
    write_state "$name" "$failures" "$last_notified"
    return
  fi

  local text="[watchdog] $name unhealthy for ${FAILURE_THRESHOLD}+ minutes. Check: docker logs $name"
  if [ "$name" = "nanoclaw-paw" ]; then
    text="[watchdog] nanoclaw-paw unhealthy for ${FAILURE_THRESHOLD}+ minutes. Check: logs at services/nanoclaw-paw/"
  fi
  send_notification "$text" || true
  local now
  now="$(date -u +%Y-%m-%dT%H:%M:%S+00:00)"
  write_state "$name" "$failures" "$now"
}

# ── Main ──────────────────────────────────────────────────────────
main() {
  mkdir -p "$(dirname "$LOG_FILE")"
  init_state
  for name in $MONITORED_CONTAINERS nanoclaw-paw; do
    check_component "$name"
  done
}

# Only run when executed directly, not when sourced
if [ "${WATCHDOG_SOURCED:-}" != "1" ]; then
  main "$@"
fi
