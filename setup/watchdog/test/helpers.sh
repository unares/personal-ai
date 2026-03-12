#!/bin/bash
# Shared test helpers for watchdog tests.

PASS=0
FAIL=0
TOTAL=0

pass() {
  PASS=$((PASS + 1))
  TOTAL=$((TOTAL + 1))
  echo "  PASS: $1"
}

fail() {
  FAIL=$((FAIL + 1))
  TOTAL=$((TOTAL + 1))
  echo "  FAIL: $1 — $2"
}

reset_sandbox() {
  rm -f "$STATE_FILE" "$LOG_FILE"
  rm -f "$IPC_DIR"/msg-*.json
  rm -f "$PID_FILE"
  rm -f "${SANDBOX}/mock-docker-"*
  rm -f "${SANDBOX}/curl-calls.txt"
  rm -f "${SANDBOX}/mock-curl-fail"
  rm -f "$EMERGENCY_KEY_FILE" "$CONFIG_FILE"
  if [ -f "${SANDBOX}/mock-paw-pid" ]; then
    kill "$(cat "${SANDBOX}/mock-paw-pid")" 2>/dev/null || true
    rm -f "${SANDBOX}/mock-paw-pid"
  fi
}

docker() {
  case "$1" in
    inspect)
      local name="${!#}"
      if [ -f "${SANDBOX}/mock-docker-${name}" ]; then
        cat "${SANDBOX}/mock-docker-${name}"
      else
        return 1
      fi
      ;;
    *)
      command docker "$@"
      ;;
  esac
}

curl() {
  echo "curl-called" >> "${SANDBOX}/curl-calls.txt"
  if [ -f "${SANDBOX}/mock-curl-fail" ]; then
    return 1
  fi
  return 0
}

mock_container_healthy() {
  echo "healthy" > "${SANDBOX}/mock-docker-$1"
}

mock_container_unhealthy() {
  echo "unhealthy" > "${SANDBOX}/mock-docker-$1"
}

mock_container_missing() {
  rm -f "${SANDBOX}/mock-docker-$1"
}

mock_paw_alive() {
  sleep 300 &
  local pid=$!
  echo "$pid" > "$PID_FILE"
  echo "$pid" > "${SANDBOX}/mock-paw-pid"
}

mock_paw_dead() {
  if [ -f "${SANDBOX}/mock-paw-pid" ]; then
    kill "$(cat "${SANDBOX}/mock-paw-pid")" 2>/dev/null || true
    rm -f "${SANDBOX}/mock-paw-pid"
  fi
  rm -f "$PID_FILE"
}

count_ipc() {
  find "$IPC_DIR" -maxdepth 1 -name 'msg-*.json' 2>/dev/null | wc -l | tr -d ' '
}

print_summary() {
  echo ""
  echo "==================="
  echo "Results: ${PASS}/${TOTAL} passed, ${FAIL} failed"
  if [ "$FAIL" -gt 0 ]; then
    exit 1
  fi
}
