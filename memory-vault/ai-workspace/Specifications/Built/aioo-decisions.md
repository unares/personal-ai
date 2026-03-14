# AIOO — Architectural Decisions

> Decisions made during AIOO spec-engineering. Each decision captures the
> options considered, the choice made, and the rationale.
> Date started: 2026-03-12

## Decision A1: What Runs Inside AIOO?

**Question:** Is AIOO a custom daemon, a Claude Code CLI session, or a hybrid?

**Answer: Hybrid** — Node.js daemon + Gemini 3.1 Pro brain.

### The Boundary Principle

Daemon owns STATE and ROUTING. Brain owns JUDGMENT and INTERPRETATION.

```
┌─────────────────────────────────────────────────────────────┐
│                    AIOO Container                            │
│                                                              │
│  ┌──────────────────────┐   ┌────────────────────────────┐  │
│  │  Daemon (Node.js)    │   │  Brain (Gemini 3.1 Pro)    │  │
│  │                      │   │                            │  │
│  │  State machine       │   │  "Are these outcomes met?" │  │
│  │  Event loop          │   │  "Break this spec into     │  │
│  │  IPC routing         │   │   tasks"                   │  │
│  │  File watching       │   │  "Should I escalate to     │  │
│  │  Health checks       │   │   human?"                  │  │
│  │  Stage transition    │   │  "Evaluate this agent's    │  │
│  │   mechanics          │   │   output"                  │  │
│  │  Cost aggregation    │   │  "Adapt — plan failed"     │  │
│  │                      │   │                            │  │
│  │  Runs: always        │   │  Runs: on-demand           │  │
│  │  Cost: $0            │   │  Cost: tokens (Gemini)     │  │
│  └──────────┬───────────┘   └─────────────┬──────────────┘  │
│             │                             │                  │
│             └──────────┬──────────────────┘                  │
│                        │                                     │
│              Daemon CALLS Brain                              │
│              Brain NEVER calls itself                        │
└─────────────────────────────────────────────────────────────┘
```

### Task Allocation

| Task | Daemon or Brain? | Why |
|------|-------------------|-----|
| Track task graph state | Daemon | Pure state machine — JSON in/out |
| Watch vault for file changes | Daemon | File watcher, zero reasoning |
| Route IPC messages | Daemon | Pattern match on message type |
| Switch stage profiles | Daemon | `docker compose` commands |
| Aggregate token costs | Daemon | Arithmetic |
| **Decide if outcomes are met** | **Brain** | Requires reading vault + judgment |
| **Decompose spec → tasks** | **Brain** | Requires understanding intent |
| **Decide when to escalate** | **Brain** | Context-dependent judgment |
| **Evaluate agent output** | **Brain** | Quality assessment |
| **Adapt when a task fails** | **Brain** | Creative problem-solving |

### The RoT Test

For any new capability:

```
Can a 10-line function do this?
  yes → Daemon (infinite RoT)
  no  → Does it require understanding context?
          yes → Brain (high-leverage LLM use)
          no  → Daemon with more lines (still cheaper than tokens)
```

### Why Gemini 3.1 Pro (not Claude)?

AIOO's brain does orchestration judgment — not coding. Claude (via Agent SDK)
excels at code generation and is used for worker agents in App Dev Stage
containers. Separating the brain model from the worker model:

- Enables independent model selection per role (best tool for job)
- ai-gateway routes AIOO brain calls to Gemini, worker calls to Claude
- Clear cost attribution: brain tokens vs worker tokens

### Worker Agent Flow

When the Brain decides work needs doing:

```
Brain (Gemini) → "spawn coding agent for task X"
     │
     ▼
Daemon → writes IPC signal to NanoClaw-PAW
     │
     ▼
NanoClaw-PAW (host) → spawns Agent SDK agent (Claude)
                       in App Dev Stage Container
```

### participate.sh on AIOO

Not needed for operation. AIOO is a daemon, not a CLI session. Inspect from
outside:

- Logs: `memory-vault/{entity}/Logs/`
- Task graph: vault files
- Container logs: `docker logs aioo-{entity}`

participate.sh reserved for App Dev Stage containers (pair-programming).
On AIOO: debugging escape hatch only.

## Decision A1.1: When Does Daemon Call Brain?

**Question:** What triggers the Daemon to invoke the Brain (Gemini)?

**Answer: Hybrid triggers** — events for real-time, schedule for routine.

```
Real-time triggers (immediate Brain call):
- New IPC message arrives (human message, agent report)
- New file dropped in vault Raw/
- Stage timeout exceeded
- Agent failure signal

Scheduled triggers (periodic Brain call):
- Daily outcome assessment (are stage acceptance criteria met?)
- Weekly RoT review (token spend vs value delivered)
- Configurable intervals per entity
```

**Rationale:** Events catch urgent signals without polling waste. Scheduled
checks catch slow-moving changes (outcomes gradually being met) without
missing them. Minimizes token spend while maintaining awareness.

## Decision A2: Task Graph Storage

**Question:** How does AIOO store its task graph (working memory)?

**Answer: JSON Files** (Phase 1), with Option C (JSON + Index) documented for future.

### Phase 1: JSON Files

```
memory-vault/{entity}/Tasks/
├── active.json        ← current task graph (what's in progress)
├── completed.json     ← finished tasks (outcomes + results)
└── history.json       ← event log (state transitions over time)
```

**Why JSON files:**
- Single writer (Daemon only) — no concurrent write risk
- Debuggable from outside container (`cat`, `jq` on vault files)
- Vault-native — Chronicle can index task state automatically
- VPS migration: files sync with everything else

**Why not SQLite (Phase 1):**
- Overkill for single-writer scenario
- Binary blob doesn't integrate with vault tooling
- Query power not needed when task count is low

### Future: Option C (JSON + Index)

If query complexity grows (many completed tasks, need to search history):

```
tasks/
├── active.json        ← source of truth (same as Phase 1)
├── completed.json     ← source of truth
└── history.json       ← source of truth
+ state.db             ← derived index (rebuilt from JSON)
```

- JSON files remain source of truth
- SQLite index is derived — can be deleted and rebuilt
- Add when: task count makes JSON scanning slow, or need complex queries
- Trigger: "I need to query tasks by date range / status / outcome"

## Decision A3: IPC Protocol

**Question:** How do containers communicate via filesystem IPC?

**Answer: Typed Envelope** — structured JSON messages with id, type, tracing.

### Message Envelope

```json
{
  "id": "uuid",
  "type": "spawn-agent",
  "from": "aioo-procenteo",
  "to": "nanoclaw-paw",
  "timestamp": "ISO-8601",
  "payload": { },
  "replyTo": "uuid | null"
}
```

Six fields. `id` + `replyTo` enable full conversation tracing.
`type` enables schema validation per message kind.

### Message Types (Initial Set)

| Type | From → To | Purpose |
|------|-----------|---------|
| `spawn-agent` | AIOO → NanoClaw-PAW | Request agent spawn in stage container |
| `agent-report` | NanoClaw-PAW → AIOO | Agent completed/failed |
| `human-message` | NanoClaw-PAW → AIOO | Human sent message via messaging |
| `human-reply` | AIOO → NanoClaw-PAW | AIOO response to human |
| `stage-signal` | AIOO → host script | Request stage transition |
| `stage-ack` | host script → AIOO | Stage transition completed |
| `brain-request` | Daemon → Brain | Internal: ask Gemini for judgment |
| `brain-response` | Brain → Daemon | Internal: Gemini's answer |

### Directory Layout

```
ipc/
├── aioo-to-paw/         ← AIOO writes, NanoClaw-PAW reads
│   ├── msg-{uuid}.json
│   └── processed/       ← read messages moved here (audit trail)
├── paw-to-aioo/         ← NanoClaw-PAW writes, AIOO reads
│   └── processed/
└── aioo-to-stage/       ← AIOO writes, stage container reads
    └── processed/
```

### Delivery Mechanism

- Shared directory per channel (Docker volume mount)
- One JSON file per message
- Reader polls at 1s intervals (NanoClaw pattern)
- Processed messages moved to `processed/` subdirectory
- Debuggable: `ls` to see pending, `cat` to read, `jq` to query

## Decision A4: AIOO ↔ Stage Container Interface

**Question:** How does AIOO assign and monitor work inside stage containers?

**Answer: NanoClaw-PAW Spawns Agents** — AIOO speaks IPC, NanoClaw-PAW
handles execution.

### Two Concerns, Two Solutions

| Concern | Solution | Mechanism |
|---------|----------|-----------|
| Lifecycle (start/stop container) | Stage Lifecycle Script (host) | IPC: `stage-signal` / `stage-ack` |
| Work (do task X inside container) | NanoClaw-PAW agent spawning | IPC: `spawn-agent` / `agent-report` |

### Agent-Per-Task Model

Each task gets a fresh Agent SDK agent. Spawn, execute, report, die.

```
AIOO Daemon                    NanoClaw-PAW (host)           Stage Container
    │                               │                             │
    │  spawn-agent (IPC)            │                             │
    │──────────────────────────────►│                             │
    │  {task, stage, context}       │  Agent SDK spawn            │
    │                               │────────────────────────────►│
    │                               │                             │  Agent works
    │                               │                             │  (reads vault,
    │                               │                             │   writes code,
    │                               │         agent-report        │   commits)
    │         agent-report (IPC)    │◄────────────────────────────│
    │◄──────────────────────────────│                             │  Agent dies
    │  {status, result, tokens}     │                             │
```

### Why This Model

- **Clean lifecycle:** no long-running agent daemons inside stage containers
- **Fresh context:** each agent gets clean context window (no pollution)
- **Reuse:** NanoClaw-PAW already handles Agent SDK spawning
- **Separation:** AIOO never manages Docker or agents directly
- **Traceability:** every task = one agent = one IPC roundtrip = one token count

### Key Principle

AIOO is the brain. NanoClaw-PAW is the hands. AIOO decides WHAT to do.
NanoClaw-PAW executes HOW (spawning agents, managing their lifecycle).
AIOO never touches Docker directly.

## Decision A5: HITL Protocol

**Question:** How does AIOO communicate with humans when it needs decisions?

**Answer: Three-tier HITL** with predefined rules and Brain escalation override.

### The Three Tiers

```
┌─────────────────────────────────────────────────────────────────────┐
│  Tier          Medium              Human Time    Tool               │
├─────────────────────────────────────────────────────────────────────┤
│  Micro-HITL    Messaging           < 30 sec      WhatsApp/         │
│                (yes/no/short)                     Telegram/Discord  │
│                                                                     │
│  Light-HITL    .md file in vault   < 10 min      Obsidian on       │
│                + messaging notify                 phone/tablet      │
│                                                                     │
│  Heavy-HITL    Claude Code CLI     10 min+       Terminal /         │
│                session                            participate.sh    │
└─────────────────────────────────────────────────────────────────────┘
```

### Micro-HITL: Messaging Response

For binary decisions and quick confirmations.

```
AIOO → NanoClaw-PAW → WhatsApp → Human replies "yes" → back to AIOO

Example message:
  [procenteo] Stage 1 → Stage 2?
  ✓ App runs locally
  ✓ 3 core flows work
  ✓ Demo exists
  Reply: YES to proceed, NO + reason to hold
```

### Light-HITL: Vault File + Notification

For inputs that need thought but not a full CLI session. AIOO writes a
structured .md file to vault, notifies human via messaging. Human edits
in Obsidian, AIOO detects file change and proceeds.

```
AIOO Daemon
  │  Writes structured .md to vault
  │  e.g. memory-vault/{entity}/Tasks/hitl-{uuid}.md
  ▼
AIOO → NanoClaw-PAW → WhatsApp
  "Review needed: Stage 2 outcomes for procenteo.
   Open in Obsidian, edit, save when done."
  ▼
Human opens in Obsidian (phone/tablet/desktop)
  │  Reads context, fills in sections, saves
  ▼
AIOO Daemon (file watcher detects change)
  │  Reads updated .md → Brain interprets → acts
  ▼
Done. No CLI launch needed.
```

**Use cases:**
- Define acceptance criteria for next stage
- Review and adjust task priorities
- Provide context/requirements for a feature
- Review agent output that needs nuanced feedback

### Heavy-HITL: Claude Code CLI Session

For work that requires exploration, investigation, or co-design.

```
AIOO → messaging: "Need your help in procenteo-app-demo"
Human → launches participate.sh → enters container
Full Claude Code session (pair-programming, debugging, design)
```

**Use cases:**
- First-time stage setup (outcomes, architecture decisions)
- Debugging failing agents
- Architectural co-design sessions
- Complex investigation

### When to Use Which

| Situation | HITL Tier | Why |
|-----------|-----------|-----|
| Stage transition approval | Micro | Binary yes/no, context in message |
| Budget alert acknowledge | Micro | Quick response |
| Agent needs quick clarification | Micro | One-line answer |
| Define next stage outcomes | **Light** | Structured input, < 10 min |
| Review/adjust task priorities | **Light** | Edit a list, save |
| Provide feature requirements | **Light** | Write a few paragraphs |
| Review agent output quality | **Light** | Read + annotate |
| First-time entity setup | **Heavy** | Exploration, Northstar, vault init |
| Debugging failing agents | **Heavy** | Investigation, code inspection |
| Architecture co-design | **Heavy** | Deep session |

### Decision Principle

```
Can human respond in < 30 seconds from message alone?
  yes → Micro-HITL (messaging)
  no  → Can human respond in < 10 min editing a .md file?
          yes → Light-HITL (vault file + Obsidian)
          no  → Heavy-HITL (Claude Code CLI)
```

### Decision A5.1: Who Decides the Tier?

**Answer: Predefined rules with Brain escalation override.**

- Config maps situation types to HITL tiers (table above as defaults)
- Brain can escalate UP (micro → light, light → heavy) if context warrants
- Brain can NEVER downgrade (heavy → light, light → micro)
- Safety principle: always err toward more human involvement

```
Rule says micro? → Brain can escalate to light or heavy
Rule says light? → Brain can escalate to heavy
Rule says heavy? → Always heavy (never downgrade)
```

## Decision A6: Failure Modes

**Question:** What happens when things break?

**Answer:** Each failure type has a defined detection, recovery, and
notification strategy. State survives crashes (JSON files on disk).
Host watchdog provides backup notification when AIOO can't self-report.

### Failure Table

| # | Failure | Blast Radius | Detection | Recovery | HITL |
|---|---------|-------------|-----------|----------|------|
| 1 | Agent fails task | Low | `agent-report` status: failed | Retry (max 2x), then escalate | Micro if escalated |
| 2 | Brain (Gemini) down | Medium | API timeout / error | Queue requests, backoff retry. 3 failures → notify | Micro |
| 3 | Stage container crash | Medium | Docker health check | Compose `restart: unless-stopped`. 3 in 10 min → notify | Micro if repeated |
| 4 | NanoClaw-PAW crash | High | AIOO IPC timeout | Compose auto-restart. AIOO buffers outbound IPC | None (auto) |
| 5 | AIOO daemon crash | High | Compose health check | Auto-restart. Recover state from JSON. Brain re-evaluates stale tasks | Micro after restart |
| 6 | Host machine down | Critical | External monitoring | Compose `restart: always`. Everything recovers on reboot | Heavy (investigate) |

### Key Principle: State Survives Crashes

AIOO's state is on disk (Decision A2), not in memory:

```
AIOO crashes → Compose restarts → Daemon reads:
  Tasks/active.json    → "what was I doing?"
  Tasks/history.json   → "what happened before crash?"
  ipc/paw-to-aioo/     → "any messages I missed?"

Brain (Gemini) re-evaluates stale tasks → continues or escalates
```

### Agent Retry Policy

```
Agent fails task
  │
  ▼
Attempt 1 of 3?
  yes → Retry with same context
  no  → Attempt 2 of 3?
          yes → Retry with modified approach (Brain generates new strategy)
          no  → Mark task blocked → Micro-HITL
                "Agent failed 3x on: {task}. Options: retry, skip, redefine"
```

### Host Watchdog (Backup Notification)

When AIOO is down and can't self-report, the host watchdog ensures the
human is notified. Simple cron script, no air-gap violations.

```
watchdog.sh (cron, every 60s)
  │
  ├─ docker inspect aioo-procenteo → healthy?
  ├─ docker inspect aioo-inisio    → healthy?
  ├─ docker inspect nanoclaw-paw   → healthy?
  │
  └─ Unhealthy for > 3 consecutive checks:
       ├─ NanoClaw-PAW alive? → notify via PAW messaging
       └─ NanoClaw-PAW also down? → direct API call
           (emergency WhatsApp/Telegram credential on host)
```

**Clark is explicitly excluded from failure notification.** Clark's job is
to help humans think clearly. Monitoring AIOO's health would contaminate
Clark's independent perspective — cognitive isolation, not just network
isolation. The host watchdog handles backup notification without
involving any agent.

### Failure Logging

All failures logged to `memory-vault/{entity}/Logs/` with:
- ISO timestamp
- Failure type (1-6 from table)
- Component that failed
- Recovery action taken
- Tokens spent on recovery (if Brain involved)

Feeds into RoT measurement — recovery costs are real costs.

## References

- AIOO spec (to be created after decisions): `./aioo.md`
- JTBD framework: `./jtbd-specification-engineering.md`
- Security patterns: `./security-patterns.md`
- Architecture: `memory-vault/ARCHITECTURE.md`
