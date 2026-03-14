# Stage Lifecycle — Specification

> Stage transitions as a NanoClaw-PAW module. Not a standalone script.
> Date: 2026-03-12

## JTBD

"When AIOO determines that stage outcomes are met and the human approves
a transition, I want the stage switch to happen reliably — new stage up,
verified healthy, old stage down — so that no work is lost and the App
Factory pipeline progresses safely."

## The 5 Primitives

### 1. Problem Statement

App Dev Stage transitions (Demo → Testing → Launch → Scaling) require
Docker Compose profile switching on the host. AIOO runs inside a container
and cannot execute Docker commands. NanoClaw-PAW already runs on the host
with Docker access. Rather than adding a standalone script or daemon,
stage lifecycle becomes a handler module inside NanoClaw-PAW — reusing
existing IPC infrastructure and host process.

### 2. Acceptance Criteria

1. AIOO sends a `stage-signal` IPC message and receives a `stage-ack`
   confirming the transition completed (or failed with reason).
2. The new stage container is verified healthy before the old one is
   brought down (no gap in service).
3. If the new stage fails health check, the old stage stays running
   and AIOO receives a failure ack with details.
4. Stage transitions are logged with timestamps, from-stage, to-stage,
   and duration in `memory-vault/{entity}/Logs/`.
5. No stage transition happens without a preceding human approval
   (enforced by AIOO's HITL protocol, not by this module — but this
   module validates that the signal came from AIOO, not forged).

### 3. Constraint Architecture

**Must do:**
- Live inside NanoClaw-PAW as a handler module (not standalone)
- Use Docker Compose profiles for stage management
- Bring up new before bringing down old (safe transition)
- Health check new stage before removing old
- Send stage-ack with success/failure status
- Log all transitions

**Must not do:**
- Decide whether to transition (AIOO decides, human approves)
- Run as a separate process or daemon
- Modify vault content (only reads compose config, writes logs)
- Skip health checks (even if AIOO says "urgent")

**Preferences:**
- Timeout: 120s for new stage to become healthy (configurable)
- Rollback: if new stage fails, old stage untouched (no rollback needed
  because old was never stopped)

**Escalation triggers:**
- New stage fails health check → failure ack to AIOO → AIOO decides
  (retry, investigate, escalate to human)
- Compose command fails → failure ack with error details
- Unknown stage in signal → reject with error

### 4. Decomposition

#### Transition Flow

```
AIOO                     NanoClaw-PAW                    Docker Compose
  │                      (Stage Handler)
  │  stage-signal        ┌──────────────┐
  │  {entity, app,       │              │
  │   from: "demo",      │ 1. Validate  │
  │   to: "testing"}     │    signal    │
  │─────────────────────►│              │
  │                      │ 2. Check     │
  │                      │    from-stage│──── docker compose ps
  │                      │    running?  │     procenteo-app-demo
  │                      │              │
  │                      │ 3. Bring up  │──── docker compose
  │                      │    to-stage  │     --profile procenteo-app-testing
  │                      │              │     up -d
  │                      │ 4. Health    │
  │                      │    check     │──── poll health endpoint
  │                      │    (120s     │     every 5s until healthy
  │                      │    timeout)  │     or timeout
  │                      │              │
  │                      │ 5. Bring     │──── docker compose
  │                      │    down      │     --profile procenteo-app-demo
  │                      │    from-stage│     down
  │                      │              │
  │  stage-ack           │ 6. Log +     │
  │  {status: "success", │    ack       │
  │   duration: "34s"}   │              │
  │◄─────────────────────│              │
  │                      └──────────────┘
```

#### Failure Flow

```
Step 4 health check fails (timeout after 120s):
  │
  ▼
Do NOT bring down from-stage (old stage stays running)
  │
  ▼
stage-ack {status: "failed", reason: "health-check-timeout",
           stage: "procenteo-app-testing", from_stage_status: "still-running"}
  │
  ▼
AIOO Brain decides: retry? investigate? escalate to human?
```

#### Validation Rules

| Check | When | Failure Response |
|-------|------|-----------------|
| Signal has required fields | On receipt | Reject, error ack |
| `from` stage is actually running | Before transition | Error ack |
| `to` stage is defined in compose | Before transition | Error ack |
| `from` → `to` is valid progression | Before transition | Error ack |
| New stage passes health check | After bring-up | Failure ack, keep old |

Valid progressions (sequential only):
```
demo → testing → launch → scaling
```
No skipping. No going backwards. If AIOO sends `demo → launch`,
the handler rejects it.

#### IPC Messages

**stage-signal (AIOO → NanoClaw-PAW):**
```json
{
  "id": "uuid",
  "type": "stage-signal",
  "from": "aioo-procenteo",
  "to": "nanoclaw-paw",
  "timestamp": "ISO-8601",
  "payload": {
    "entity": "procenteo",
    "app": "procenteo",
    "fromStage": "demo",
    "toStage": "testing"
  },
  "replyTo": null
}
```

**stage-ack (NanoClaw-PAW → AIOO):**
```json
{
  "id": "uuid",
  "type": "stage-ack",
  "from": "nanoclaw-paw",
  "to": "aioo-procenteo",
  "timestamp": "ISO-8601",
  "payload": {
    "status": "success | failed",
    "entity": "procenteo",
    "app": "procenteo",
    "fromStage": "demo",
    "toStage": "testing",
    "duration": "34s",
    "reason": null
  },
  "replyTo": "uuid-of-stage-signal"
}
```

#### NanoClaw-PAW Integration

```
NanoClaw-PAW (host process)
├── Messaging handler      (existing — WhatsApp/Telegram/Discord)
├── Agent spawn handler    (existing — Agent SDK in stage containers)
├── Clark handler          (existing — ephemeral container lifecycle)
└── Stage handler (NEW)
    ├── validateSignal()       → check fields, progression, state
    ├── bringUpStage()         → docker compose --profile ... up -d
    ├── waitForHealth()        → poll health endpoint, 120s timeout
    ├── bringDownStage()       → docker compose --profile ... down
    └── sendAck()              → write stage-ack to IPC
```

Four functions. Single responsibility each. The handler is ~50-80 lines.

### 5. Evaluation Design

| Test | Expected Result |
|------|-----------------|
| Valid stage-signal (demo → testing) | New stage up, health check passes, old stage down, success ack |
| New stage fails health check | Old stage stays running, failure ack with reason |
| Invalid progression (demo → launch) | Rejected immediately, error ack |
| From-stage not running | Error ack, no compose commands executed |
| Unknown entity in signal | Error ack |
| Check logs after transition | Entry with timestamp, stages, duration |
| NanoClaw-PAW restart mid-transition | On restart, no half-state — either completed or old stage still running |

## Key Design Decision

**Why NanoClaw-PAW module, not standalone script:**
- NanoClaw-PAW already runs on host with Docker access
- Already reads IPC directories (same channel AIOO uses)
- No new daemon, no new process, no new IPC path
- Stage handler is just another message type in the router
- Host process count stays at one (NanoClaw-PAW)

Documented in: `./aioo-decisions.md` (referenced from A4)

## References

- AIOO spec: `./aioo.md` (Stage Controller module sends signals)
- AIOO decisions: `./aioo-decisions.md` (A3: IPC protocol, A4: interface)
- App Dev Stages: `./app-dev-stages.md` (stage definitions + naming)
- NanoClaw-PAW: `./nanoclaw-paw.md` (host process this lives inside)
- Security patterns: `./security-patterns.md` (mount security per stage)
