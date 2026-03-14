# Host Watchdog — Specification

> Backup notification when AIOO can't self-report.
> Date: 2026-03-12
> Origin: AIOO Decision A6 (`./aioo-decisions.md`)

## JTBD

"When AIOO or NanoClaw-PAW is down and can't message me, I want to be
notified anyway, so I can investigate before the system sits idle for
hours without my knowledge."

## The 5 Primitives

### 1. Problem Statement

AIOO notifies humans via NanoClaw-PAW messaging. If AIOO crashes, it
can't notify. If NanoClaw-PAW crashes, nobody can notify. The host
watchdog is a minimal cron script that checks container health
independently and sends notifications through a backup channel when
the primary notification path is broken.

Clark is explicitly excluded from failure notification to preserve
its cognitive independence (air-gap is not just network — it's awareness).

### 2. Acceptance Criteria

1. If aioo-procenteo is unhealthy for 3+ consecutive checks (3 minutes),
   the human receives a notification identifying the failed container.
2. If NanoClaw-PAW is also down, the notification still arrives via
   direct messaging API fallback.
3. The watchdog itself has zero dependencies on AIOO, NanoClaw-PAW,
   or any container — it uses only host Docker CLI and curl.
4. False positives are minimized: 3 consecutive failures required
   before notification (handles restarts and brief health check flaps).

### 3. Constraint Architecture

**Must do:**
- Run on host as cron job (every 60s)
- Check health of: aioo-{entity}, nanoclaw-paw (all running instances)
- Notify via NanoClaw-PAW if available, direct API if not
- Require 3 consecutive failures before alerting (debounce)
- Log all checks to a local file

**Must not do:**
- Monitor Clark containers (ephemeral, managed by NanoClaw-PAW)
- Monitor App Dev Stage containers (AIOO handles these)
- Attempt recovery (restart, heal) — only notify
- Store state in vault (watchdog is independent of vault)

**Preferences:**
- Pure bash (no Node.js, no Python — minimal dependencies)
- State file: `/tmp/watchdog-state.json` (failure counters)
- One emergency credential on host for direct API fallback
- Silent when healthy (no "all good" messages)

**Escalation triggers:**
- 3 consecutive failures for any monitored container → notify human
- NanoClaw-PAW down → switch to direct API fallback
- NanoClaw-PAW + direct API both fail → log locally, retry next cycle

### 4. Decomposition

#### Check Flow

```
watchdog.sh (cron, every 60s)
  │
  ├─ For each monitored container:
  │    docker inspect --format '{{.State.Health.Status}}' {name}
  │    │
  │    ├─ healthy → reset failure counter to 0
  │    └─ unhealthy/missing → increment failure counter
  │
  ├─ Any counter >= 3?
  │    │
  │    ├─ no → exit silently
  │    └─ yes → notify
  │              │
  │              ├─ Is NanoClaw-PAW healthy?
  │              │    yes → send via PAW IPC
  │              │    no  → send via direct API (curl)
  │              │
  │              └─ Log notification sent
  │
  └─ Write state to /tmp/watchdog-state.json
```

#### Monitored Containers

| Container | Why Monitored | Impact If Down |
|-----------|---------------|----------------|
| aioo-procenteo | Entity operational brain | Procenteo work stops |
| aioo-inisio | Entity operational brain | Inisio work stops |
| NanoClaw-PAW* | Messaging + agent spawning | All messaging + agents stop |

*NanoClaw-PAW is a host process, not a container. Watchdog checks it
via process check (`pgrep` or PID file) rather than `docker inspect`.

Note: Chronicle and ai-gateway are NOT monitored by watchdog.
AIOO monitors those via its Health Monitor module (Decision A6).
Watchdog only covers components whose failure breaks the notification
path itself.

#### State File

```json
{
  "aioo-procenteo": {"failures": 0, "lastCheck": "ISO-8601"},
  "aioo-inisio": {"failures": 2, "lastCheck": "ISO-8601"},
  "nanoclaw-paw": {"failures": 0, "lastCheck": "ISO-8601"},
  "lastNotification": "ISO-8601"
}
```

Stored in `/tmp/` — lost on reboot, which is fine (counters reset,
containers also restart on reboot, health checks start fresh).

#### Notification Channels

```
Primary:   NanoClaw-PAW IPC → messaging (WhatsApp/Telegram/Discord)
Fallback:  Direct API call (curl to messaging provider)

Notification format:
  "⚠ [watchdog] aioo-procenteo unhealthy for 3+ minutes.
   Check: docker logs aioo-procenteo"
```

Direct API fallback requires one stored credential on the host.
This is the only credential not managed by the credential proxy
(because the credential proxy runs inside NanoClaw-PAW, which may
be the thing that's down).

```
Host credential storage:
  ~/.watchdog/emergency-api-key    (chmod 600, owner-only read)

Used only when NanoClaw-PAW is also down.
```

#### Notification Throttling

- After sending a notification, set cooldown (default: 15 minutes)
- Don't re-notify for the same container during cooldown
- Different containers have independent cooldowns
- Prevents notification storms during extended outages

### 5. Evaluation Design

| Test | Expected Result |
|------|-----------------|
| All containers healthy | Watchdog runs silently, no output |
| Stop aioo-procenteo, wait 1 min | Failure counter = 1, no notification |
| Stop aioo-procenteo, wait 3 min | Counter = 3, notification sent via PAW |
| Stop aioo-procenteo + NanoClaw-PAW | Notification via direct API fallback |
| Restart aioo-procenteo after notification | Counter resets to 0, silence resumes |
| Reboot host | State file lost, counters start fresh, no false alerts |
| Two containers down simultaneously | Separate notifications for each |
| Same container down for 30 min | One notification, then throttled (no spam) |

## Implementation Sketch

```bash
#!/bin/bash
# watchdog.sh — host cron job, every 60s
# Monitors AIOO and NanoClaw-PAW, notifies on extended failure.

STATE_FILE="/tmp/watchdog-state.json"
COOLDOWN_SECONDS=900  # 15 minutes
THRESHOLD=3

CONTAINERS=("aioo-procenteo" "aioo-inisio")

# Check container health
check_container() {
  local name=$1
  local status
  status=$(docker inspect --format '{{.State.Health.Status}}' "$name" 2>/dev/null)
  [[ "$status" == "healthy" ]]
}

# Check NanoClaw-PAW (host process)
check_paw() {
  pgrep -f "nanoclaw-paw" > /dev/null 2>&1
}

# Send notification (PAW or direct API)
notify() {
  local message=$1
  if check_paw; then
    # Write IPC message for NanoClaw-PAW
    echo "$message"  # actual: write typed envelope to IPC dir
  else
    # Direct API fallback
    echo "$message"  # actual: curl to messaging API
  fi
}

# Main loop over monitored components
# ... (increment counters, check threshold, notify if needed)
```

Actual implementation is ~40-60 lines of bash. No dependencies beyond
Docker CLI, jq, and curl.

## Cron Setup

```
# /etc/cron.d/watchdog (or crontab -e)
* * * * * /path/to/watchdog.sh >> /var/log/watchdog.log 2>&1
```

## References

- AIOO Decision A6: `./aioo-decisions.md` (failure modes)
- AIOO Health Monitor: `./aioo.md` (monitors Chronicle, ai-gateway)
- NanoClaw-PAW: `./nanoclaw-paw.md` (primary notification path)
- Security Patterns: `./security-patterns.md` (credential storage)
