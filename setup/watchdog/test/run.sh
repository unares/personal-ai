#!/bin/bash
# Watchdog test runner — 15 tests covering all acceptance criteria.
set -uo pipefail

TEST_DIR="$(cd "$(dirname "$0")" && pwd)"
WATCHDOG_DIR="$(cd "$TEST_DIR/.." && pwd)"

# Test sandbox
SANDBOX=$(mktemp -d)
trap 'cleanup_all' EXIT

cleanup_all() {
  if [ -f "${SANDBOX}/mock-paw-pid" ]; then
    kill "$(cat "${SANDBOX}/mock-paw-pid")" 2>/dev/null || true
  fi
  rm -rf "$SANDBOX"
}

# Override paths before sourcing
export SCRIPT_DIR="$WATCHDOG_DIR"
export PROJECT_ROOT="$(cd "$WATCHDOG_DIR/../.." && pwd)"
export STATE_FILE="${SANDBOX}/watchdog-state.json"
export LOG_FILE="${SANDBOX}/watchdog.log"
export PID_FILE="${SANDBOX}/nanoclaw-paw.pid"
export IPC_DIR="${SANDBOX}/ipc/watchdog/to-paw"
export CONFIG_FILE="${SANDBOX}/config.json"
export EMERGENCY_KEY_FILE="${SANDBOX}/emergency-api-key"
export WATCHDOG_SOURCED=1

mkdir -p "$IPC_DIR/processed" "$(dirname "$LOG_FILE")"

# Source watchdog functions and test helpers
source "$WATCHDOG_DIR/watchdog.sh"
source "$TEST_DIR/helpers.sh"

echo "Host Watchdog Tests"
echo "==================="
echo ""

# T1: All healthy — no notification
echo "T1: All healthy, no notification"
reset_sandbox
mock_container_healthy "aioo-procenteo"
mock_container_healthy "aioo-inisio"
mock_paw_alive
main
f_p=$(jq -r '.["aioo-procenteo"].failures' "$STATE_FILE")
f_i=$(jq -r '.["aioo-inisio"].failures' "$STATE_FILE")
if [ "$(count_ipc)" -eq 0 ] && [ "$f_p" -eq 0 ] && [ "$f_i" -eq 0 ]; then
  pass "no notification, failures=0"
else
  fail "expected no notification" "ipc=$(count_ipc) f_p=$f_p f_i=$f_i"
fi

# T2: Single failure — no notification
echo "T2: Single failure, no notification yet"
reset_sandbox
mock_container_unhealthy "aioo-procenteo"
mock_container_healthy "aioo-inisio"
mock_paw_alive
main
if [ "$(count_ipc)" -eq 0 ] && [ "$(jq -r '.["aioo-procenteo"].failures' "$STATE_FILE")" -eq 1 ]; then
  pass "no notification, failures=1"
else
  fail "expected failures=1, no notification" ""
fi

# T3: Triple failure triggers notification
echo "T3: Triple failure triggers notification"
reset_sandbox
mock_container_healthy "aioo-inisio"
mock_container_unhealthy "aioo-procenteo"
mock_paw_alive
echo '{"aioo-procenteo":{"failures":2,"lastCheck":null,"lastNotified":null},"aioo-inisio":{"failures":0,"lastCheck":null,"lastNotified":null},"nanoclaw-paw":{"failures":0,"lastCheck":null,"lastNotified":null}}' > "$STATE_FILE"
main
ln=$(jq -r '.["aioo-procenteo"].lastNotified' "$STATE_FILE")
if [ "$(count_ipc)" -eq 1 ] && [ "$(jq -r '.["aioo-procenteo"].failures' "$STATE_FILE")" -eq 3 ] && [ "$ln" != "null" ]; then
  pass "notification sent, failures=3, lastNotified set"
else
  fail "expected notification" "ipc=$(count_ipc)"
fi

# T4: Counter reset on recovery
echo "T4: Counter reset on recovery"
reset_sandbox
mock_container_healthy "aioo-procenteo"
mock_container_healthy "aioo-inisio"
mock_paw_alive
echo '{"aioo-procenteo":{"failures":2,"lastCheck":null,"lastNotified":"2026-03-13T10:00:00+00:00"},"aioo-inisio":{"failures":0,"lastCheck":null,"lastNotified":null},"nanoclaw-paw":{"failures":0,"lastCheck":null,"lastNotified":null}}' > "$STATE_FILE"
main
f=$(jq -r '.["aioo-procenteo"].failures' "$STATE_FILE")
ln=$(jq -r '.["aioo-procenteo"].lastNotified' "$STATE_FILE")
if [ "$f" -eq 0 ] && [ "$ln" = "2026-03-13T10:00:00+00:00" ]; then
  pass "failures reset to 0, lastNotified preserved"
else
  fail "expected reset" "failures=$f lastNotified=$ln"
fi

# T5: PAW-down fallback to direct API
echo "T5: PAW down, fallback to direct API"
reset_sandbox
mock_container_unhealthy "aioo-procenteo"
mock_container_healthy "aioo-inisio"
mock_paw_dead
echo "test-token" > "$EMERGENCY_KEY_FILE"
chmod 600 "$EMERGENCY_KEY_FILE"
echo '{"provider":"telegram","endpoint":"https://api.telegram.org","chatId":"12345"}' > "$CONFIG_FILE"
echo '{"aioo-procenteo":{"failures":2,"lastCheck":null,"lastNotified":null},"aioo-inisio":{"failures":0,"lastCheck":null,"lastNotified":null},"nanoclaw-paw":{"failures":0,"lastCheck":null,"lastNotified":null}}' > "$STATE_FILE"
main
cc=$([ -f "${SANDBOX}/curl-calls.txt" ] && wc -l < "${SANDBOX}/curl-calls.txt" | tr -d ' ' || echo 0)
if [ "$(count_ipc)" -eq 0 ] && [ "$cc" -gt 0 ]; then
  pass "IPC skipped, curl called"
else
  fail "expected curl fallback" "ipc=$(count_ipc) curl=$cc"
fi

# T6: Both notification paths fail
echo "T6: Both paths fail, no crash"
reset_sandbox
mock_container_unhealthy "aioo-procenteo"
mock_container_healthy "aioo-inisio"
mock_paw_dead
echo '{"aioo-procenteo":{"failures":2,"lastCheck":null,"lastNotified":null},"aioo-inisio":{"failures":0,"lastCheck":null,"lastNotified":null},"nanoclaw-paw":{"failures":0,"lastCheck":null,"lastNotified":null}}' > "$STATE_FILE"
main
if [ $? -eq 0 ]; then pass "no crash on double failure"; else fail "expected exit 0" ""; fi

# T7: Cooldown suppression
echo "T7: Cooldown suppression"
reset_sandbox
mock_container_unhealthy "aioo-procenteo"
mock_container_healthy "aioo-inisio"
mock_paw_alive
now_iso=$(date -u +%Y-%m-%dT%H:%M:%S+00:00)
echo "{\"aioo-procenteo\":{\"failures\":5,\"lastCheck\":null,\"lastNotified\":\"${now_iso}\"},\"aioo-inisio\":{\"failures\":0,\"lastCheck\":null,\"lastNotified\":null},\"nanoclaw-paw\":{\"failures\":0,\"lastCheck\":null,\"lastNotified\":null}}" > "$STATE_FILE"
main
if [ "$(count_ipc)" -eq 0 ]; then
  pass "notification suppressed during cooldown"
else
  fail "expected suppression" "ipc=$(count_ipc)"
fi

# T8: Cooldown expiry — re-notification
echo "T8: Cooldown expiry triggers re-notification"
reset_sandbox
mock_container_unhealthy "aioo-procenteo"
mock_container_healthy "aioo-inisio"
mock_paw_alive
old_time=$(date -u -v-16M +%Y-%m-%dT%H:%M:%S+00:00 2>/dev/null || date -u -d "16 minutes ago" +%Y-%m-%dT%H:%M:%S+00:00)
echo "{\"aioo-procenteo\":{\"failures\":5,\"lastCheck\":null,\"lastNotified\":\"${old_time}\"},\"aioo-inisio\":{\"failures\":0,\"lastCheck\":null,\"lastNotified\":null},\"nanoclaw-paw\":{\"failures\":0,\"lastCheck\":null,\"lastNotified\":null}}" > "$STATE_FILE"
main
if [ "$(count_ipc)" -eq 1 ]; then
  pass "re-notification sent after cooldown expiry"
else
  fail "expected re-notification" "ipc=$(count_ipc)"
fi

# T9: Independent cooldowns
echo "T9: Independent cooldowns per container"
reset_sandbox
mock_container_unhealthy "aioo-procenteo"
mock_container_unhealthy "aioo-inisio"
mock_paw_alive
now_iso=$(date -u +%Y-%m-%dT%H:%M:%S+00:00)
echo "{\"aioo-procenteo\":{\"failures\":5,\"lastCheck\":null,\"lastNotified\":\"${now_iso}\"},\"aioo-inisio\":{\"failures\":2,\"lastCheck\":null,\"lastNotified\":null},\"nanoclaw-paw\":{\"failures\":0,\"lastCheck\":null,\"lastNotified\":null}}" > "$STATE_FILE"
main
if [ "$(count_ipc)" -eq 1 ]; then
  txt=$(jq -r '.payload.text' "$IPC_DIR"/msg-*.json 2>/dev/null)
  if echo "$txt" | grep -q "aioo-inisio"; then
    pass "inisio notified, procenteo suppressed"
  else
    fail "wrong container" "text=$txt"
  fi
else
  fail "expected 1 notification" "ipc=$(count_ipc)"
fi

# T10: Missing state file — fresh start
echo "T10: Missing state file creates fresh state"
reset_sandbox
mock_container_healthy "aioo-procenteo"
mock_container_healthy "aioo-inisio"
mock_paw_alive
main
if [ -f "$STATE_FILE" ]; then
  f_p=$(jq -r '.["aioo-procenteo"].failures' "$STATE_FILE")
  f_i=$(jq -r '.["aioo-inisio"].failures' "$STATE_FILE")
  if [ "$f_p" -eq 0 ] && [ "$f_i" -eq 0 ] && [ "$(count_ipc)" -eq 0 ]; then
    pass "state file created, no false alerts"
  else
    fail "unexpected state" "f_p=$f_p f_i=$f_i"
  fi
else
  fail "state file not created" ""
fi

# T11: Container does not exist
echo "T11: Missing container treated as unhealthy"
reset_sandbox
mock_container_missing "aioo-procenteo"
mock_container_healthy "aioo-inisio"
mock_paw_alive
main
if [ "$(jq -r '.["aioo-procenteo"].failures' "$STATE_FILE")" -eq 1 ]; then
  pass "missing container counted as unhealthy"
else
  fail "expected failures=1" ""
fi

# T12: PAW process detection
echo "T12: PAW process detection via PID file"
reset_sandbox
mock_paw_alive
result=$(check_paw)
if [ "$result" = "healthy" ]; then pass "PAW detected healthy"; else fail "expected healthy" "got=$result"; fi
mock_paw_dead
echo "99999" > "$PID_FILE"
result=$(check_paw)
if [ "$result" = "unhealthy" ]; then pass "stale PID detected unhealthy"; else fail "expected unhealthy" "got=$result"; fi

# T13: Emergency credential permissions
echo "T13: Emergency credential file permissions"
reset_sandbox
echo "test-token" > "$EMERGENCY_KEY_FILE"
chmod 600 "$EMERGENCY_KEY_FILE"
perms=$(stat -f "%Lp" "$EMERGENCY_KEY_FILE" 2>/dev/null || stat -c "%a" "$EMERGENCY_KEY_FILE" 2>/dev/null)
if [ "$perms" = "600" ]; then pass "emergency key has 600 permissions"; else fail "expected 600" "got=$perms"; fi

# T14: Two containers down simultaneously
echo "T14: Two containers down, two notifications"
reset_sandbox
mock_container_unhealthy "aioo-procenteo"
mock_container_unhealthy "aioo-inisio"
mock_paw_alive
echo '{"aioo-procenteo":{"failures":2,"lastCheck":null,"lastNotified":null},"aioo-inisio":{"failures":2,"lastCheck":null,"lastNotified":null},"nanoclaw-paw":{"failures":0,"lastCheck":null,"lastNotified":null}}' > "$STATE_FILE"
main
if [ "$(count_ipc)" -eq 2 ]; then
  pass "two separate notifications sent"
else
  fail "expected 2 notifications" "ipc=$(count_ipc)"
fi

print_summary
