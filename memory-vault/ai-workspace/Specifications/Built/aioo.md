# AIOO (AI Operating Officer) — Specification

> Per-entity operational brain. Hybrid daemon + Gemini 3.1 Pro.
> Date: 2026-03-12
> Decisions: `./aioo-decisions.md`

## JTBD

"When I have validated specs and a running App Factory pipeline, I want an
autonomous operational brain that drives tasks, spawns agents, and only
asks me when it genuinely needs human judgment, so I can focus on
strategic thinking while apps get built."

## The 5 Primitives

### 1. Problem Statement

Each app-factory entity needs an always-on operational brain that:
- Reads specs and decomposes them into tasks (via Gemini 3.1 Pro)
- Manages a task graph tracking what's done, in progress, and next
- Spawns Agent SDK agents (Claude) via NanoClaw-PAW for actual work
- Communicates with humans via three-tier HITL (Micro/Light/Heavy)
- Tracks costs per App Dev Lifecycle for RoT measurement
- Recovers from failures without losing state

AIOO does not write code. AIOO does not manage Docker. AIOO decides
WHAT to do and delegates HOW to NanoClaw-PAW (agent spawning) and
the Stage Lifecycle Script (container management).

### 2. Acceptance Criteria

1. AIOO daemon starts with `docker compose up` and runs continuously
   for its entity, recovering from crashes by reading state from disk.
2. Given a spec in `Specifications/`, AIOO's Brain (Gemini) decomposes
   it into tasks in `Tasks/active.json` without human intervention.
3. AIOO spawns an Agent SDK agent via NanoClaw-PAW IPC, receives the
   agent-report, and updates task state — full roundtrip observable
   in IPC directories and task files.
4. When a decision requires human input, AIOO selects the correct HITL
   tier (Micro/Light/Heavy) per predefined rules and sends the request
   through the appropriate channel.
5. Cost dashboard shows per-stage token spend and AIOO operating cost,
   with operating cost divided by active app count.
6. After a simulated crash (docker restart), AIOO resumes from disk
   state without repeating completed tasks.

### 3. Constraint Architecture

**Must do:**
- One AIOO instance per app-factory entity (aioo-procenteo, aioo-inisio)
- Node.js daemon for state/routing, Gemini 3.1 Pro for judgment
- All LLM calls through ai-gateway (never direct API)
- All agent spawning through NanoClaw-PAW IPC (never direct Docker)
- State on disk as JSON files (survives crashes)
- Three-tier HITL with predefined rules + Brain escalation override

**Must not do:**
- Run for the meta-entity (ai-workspace is human-operated)
- Touch Docker directly (no docker commands, no socket)
- Downgrade HITL tier (micro → heavy allowed, heavy → micro never)
- Access other entities' vaults
- Communicate with Clark containers (air-gap)

**Preferences:**
- Gemini 3.1 Pro for brain (best cost/judgment ratio as of 2026-03-12)
- Minimal node dependencies (event loop, file watcher, HTTP client)
- Config-driven per entity (one JSON config file)

**Escalation triggers:**
- Agent fails 3x → Micro-HITL to human
- Brain (Gemini) down for 3+ checks → Micro-HITL to human
- Token spend exceeds daily budget → Micro-HITL to human
- Stage outcomes met → Micro-HITL for transition approval

### 4. Decomposition

#### Module Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      AIOO Container                              │
│                                                                  │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                    Event Loop (core)                       │  │
│  │  Watches: IPC dirs, vault files, cron timers              │  │
│  │  Routes events → handlers                                 │  │
│  └──────┬────────────┬──────────┬────────────┬───────────────┘  │
│         │            │          │            │                   │
│  ┌──────▼──────┐ ┌───▼────┐ ┌──▼─────────┐ ┌▼──────────────┐  │
│  │ Task Graph  │ │ Brain  │ │ IPC        │ │ HITL          │  │
│  │ Manager     │ │ Client │ │ Handler    │ │ Manager       │  │
│  │             │ │        │ │            │ │               │  │
│  │ active.json │ │ Gemini │ │ Typed      │ │ Micro: msg    │  │
│  │ completed   │ │ via ai-│ │ Envelope   │ │ Light: .md    │  │
│  │ history     │ │ gateway│ │ read/write │ │ Heavy: notify │  │
│  └─────────────┘ └────────┘ └────────────┘ └───────────────┘  │
│         │            │          │            │                   │
│  ┌──────▼──────┐ ┌───▼────────▼─┐ ┌────────▼───────────────┐  │
│  │ Stage       │ │ Cost         │ │ Health                  │  │
│  │ Controller  │ │ Tracker      │ │ Monitor                 │  │
│  │             │ │              │ │                         │  │
│  │ stage-signal│ │ per-stage    │ │ heartbeat               │  │
│  │ stage-ack   │ │ per-lifecycle│ │ self-check              │  │
│  │ current     │ │ AIOO ops /N  │ │ failure detection       │  │
│  │ stage state │ │              │ │                         │  │
│  └─────────────┘ └──────────────┘ └─────────────────────────┘  │
│                                                                  │
│  Config: aioo-{entity}.json                                     │
└─────────────────────────────────────────────────────────────────┘
```

#### Module Details

**1. Event Loop (core)**
- Node.js process entry point
- Watches: IPC directories (chokidar/fs.watch), vault file changes, cron timers
- Routes events to the appropriate module handler
- Never processes events itself — pure routing

**2. Task Graph Manager**
- Reads/writes `memory-vault/{entity}/Tasks/*.json`
- State transitions: pending → active → completed | failed | blocked
- Provides task context to Brain Client when judgment is needed
- Records all transitions in `history.json` with timestamps

**3. Brain Client**
- Calls Gemini 3.1 Pro via ai-gateway HTTP endpoint
- Formats context (task state + vault content + spec) into prompts
- Interprets Gemini responses into structured actions
- All calls logged with token count for Cost Tracker

**4. IPC Handler**
- Implements Typed Envelope protocol (Decision A3)
- Reads messages from inbound IPC directories
- Writes messages to outbound IPC directories
- Moves processed messages to `processed/` subdirectories
- Polls at 1s intervals

**5. HITL Manager**
- Selects HITL tier using predefined rules config
- Brain can escalate UP (never downgrade)
- Micro: formats message → IPC Handler → NanoClaw-PAW → messaging
- Light: writes structured .md to vault → notifies via messaging →
  watches for file change
- Heavy: sends notification → human launches participate.sh

**6. Stage Controller**
- Sends `stage-signal` IPC to host Stage Lifecycle Script
- Handles `stage-ack` responses
- Tracks current stage per app within entity
- Never runs Docker commands (host script does that)

**7. Cost Tracker**
- Aggregates token usage from two sources:
  - Agent reports (`agent-report` IPC messages → per-stage direct cost)
  - Brain calls (Brain Client logs → AIOO operating cost)
- Writes daily summaries to `Logs/costs/`
- Cost attribution model:

```
Per-App Lifecycle Cost:
  Stage 1 (Demo)    = Σ agent tokens during Stage 1
  Stage 2 (Testing) = Σ agent tokens during Stage 2
  Stage 3 (Launch)  = Σ agent tokens during Stage 3
  Stage 4 (Scaling) = Σ agent tokens during Stage 4
  Lifecycle Total   = Σ all stages

AIOO Operating Cost:
  Brain tokens + HITL processing tokens
  Attributed per app = AIOO operating / N active apps

App True Cost = Lifecycle Total + (AIOO Operating / N)

Phase 1 (1 app):  full AIOO overhead per app
Phase 2 (2 apps): half AIOO overhead per app
Future (N apps):  diminishing overhead — AIOO amortizes
```

**8. Health Monitor**
- Writes heartbeat file for host watchdog to check
- Self-checks: can reach ai-gateway? IPC dirs writable? Disk space ok?
- Failure detection for dependencies (ai-gateway down, IPC stale)
- Logs health events to `Logs/`

#### Implementation Order

```
Phase 1: Foundation
  1. Event Loop + IPC Handler (can send/receive messages)
  2. Task Graph Manager (can track state)
  3. Health Monitor (can report alive)

Phase 2: Brain
  4. Brain Client (can call Gemini, interpret responses)
  5. HITL Manager (can communicate with humans)

Phase 3: Operations
  6. Stage Controller (can signal stage transitions)
  7. Cost Tracker (can measure RoT)
```

### 5. Evaluation Design

| Test | Expected Result |
|------|-----------------|
| `docker compose up aioo-procenteo` | Daemon starts, heartbeat file created within 5s |
| Drop spec file into vault | Brain decomposes into tasks in active.json |
| IPC message in paw-to-aioo/ | Daemon reads, routes to handler, moves to processed/ |
| Brain returns "spawn agent" | spawn-agent IPC written to aioo-to-paw/ |
| Agent report with status: failed (3x) | Micro-HITL message sent to human |
| HITL rule says Light + complex context | Brain escalates to Heavy |
| `docker restart aioo-procenteo` | Daemon recovers, reads active.json, continues |
| Run 2 apps simultaneously | AIOO operating cost divided by 2 in cost report |
| `docker exec aioo-procenteo ping clark-michal` | Connection refused (air-gap) |
| Check ai-gateway logs | All Gemini calls routed through gateway, none direct |

## Container Configuration

| Setting | Value |
|---------|-------|
| Container names | `aioo-procenteo`, `aioo-inisio` |
| Compose profile | `aioo-{entity}` |
| Restart policy | `unless-stopped` |
| Vault mount | `memory-vault/{entity}/` read-write |
| IPC mount | `ipc/` shared with NanoClaw-PAW |
| Network | ai-gateway access, NanoClaw-PAW IPC. No Clark network. |
| Health check | HTTP endpoint or heartbeat file |
| Config | `aioo-{entity}.json` (API endpoints, budgets, HITL rules) |

## External Dependencies

| Dependency | Purpose | Failure Impact |
|------------|---------|----------------|
| ai-gateway-{entity} | Brain (Gemini) API calls | Brain calls queue, retry with backoff |
| NanoClaw-PAW | Agent spawning + messaging | No agents, no human messages. AIOO buffers. |
| Stage Lifecycle Script | Stage transitions | Stage transitions blocked. Tasks continue. |
| Host watchdog | Backup notification | No backup if AIOO + PAW both down |

## References

- Architectural decisions: `./aioo-decisions.md`
- JTBD framework: `./jtbd-specification-engineering.md`
- Security patterns: `./security-patterns.md`
- NanoClaw-PAW: `./nanoclaw-paw.md`
- ai-gateway: `./ai-gateway.md`
- App Dev Stages: `./app-dev-stages.md`
- Clark (air-gapped): `./clark.md`
- Architecture: `memory-vault/ARCHITECTURE.md`
