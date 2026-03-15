# Unares — Architectural Decisions

> Decisions made during Unares spec-engineering. Each decision captures the
> options considered, the choice made, and the rationale.
> Date: 2026-03-14

## Decision U1: Runtime Model

**Question:** Is Unares persistent (like AIOO) or ephemeral (like Clark)?

**Answer: Option A — Ephemeral container (Clark pattern).**

### Options Considered

| Option | Approach | Tradeoff |
|--------|----------|----------|
| A. Ephemeral (Clark pattern) | PAW-spawned on Telegram message, Claude Code CLI, dies after 30min idle | Simple — reuses PAW spawn mechanism, no daemon code. Can't push proactively. |
| B. Persistent (AIOO pattern) | Always-on Docker Compose service, custom Node.js daemon | Can proactively monitor + push alerts. But watchdog already handles crash alerts, adds memory pressure on MacBook Air 16GB, requires writing a new daemon. |

### Why Option A

1. Watchdog already handles crash notifications — Unares doesn't need to duplicate
   push alerts
2. Reporting mode only (no GOD MODE) — no background work loop to justify a daemon
3. Demand-driven admin interface: Michal asks → Unares reads mounted files → responds
4. Reuses the exact PAW spawn mechanism Clark already uses (zero new orchestration)
5. MacBook Air 16GB — one fewer persistent container
6. Consistent with the ephemeral companion pattern (shared image, shared network)

### What This Locks In

Unares can't proactively message Michal. It only responds when asked. If proactive
daily digests are needed later, that would require either a cron job that queries
via Telegram or a persistent daemon upgrade.

### What This Changes

- New file: `src/paw/unares-handler.ts` (spawn logic, Unares-specific mounts)
- Modified: `src/paw/index.ts` (import + init + shutdown wiring)
- No docker-compose service for Unares (PAW-spawned, like Clark)

## Decision U2: Container Image

**Question:** Own Dockerfile or reuse Clark's image?

**Answer: Option A — Reuse Clark's image, renamed to `ephemeral-companion:latest`.**

### Options Considered

| Option | Approach | Tradeoff |
|--------|----------|----------|
| A. Reuse Clark's image (renamed) | Same image (node:20-alpine + Claude CLI). Identity from mounted CLAUDE.md. | Zero build overhead. Rename reflects shared purpose. |
| B. Own unares:latest | Separate Dockerfile in `containers/unares/` | Can add tools if needed. Separate image to maintain. |

### Why Option A

The container is a Claude CLI runtime. What makes Unares *Unares* is the mounted
CLAUDE.md (with @-imports to SOUL.md + UNARES_IDENTITY.md) and the broader vault
mounts. Same engine, different identity and read access.

### Rename: clark:latest → ephemeral-companion:latest

The image name should reflect its purpose — it's not Clark-specific. Both Clark
and Unares (and future ephemeral companions) share it. The Dockerfile moves from
`containers/clark/` to `containers/ephemeral-companion/`.

### Rename: clark-net → ephemeral-companion-net

Same logic — the network serves all ephemeral companions, not just Clark. Both
Clark and Unares containers connect to ephemeral-companion-net for credential
proxy access (host:3001).

### What This Changes

- `containers/clark/Dockerfile` → `containers/ephemeral-companion/Dockerfile`
- `docker-compose.yml`: `clark-net` → `ephemeral-companion-net`
- `src/paw/clark-handler.ts`: image reference + network reference updated
- `Specifications/Built/clark.md`: reflect new names
- `Specifications/Built/nanoclaw-paw.md`: reflect new names
- ARCHITECTURE.md: reflect new names

### Cross-Spec Impact

The following specs reference `clark:latest` or `clark-net` and need updating
after this rename:

| Spec | References |
|------|-----------|
| Built/clark.md | Image name, network name, Dockerfile path |
| Built/nanoclaw-paw.md | Clark handler, network reference |
| Planned/identity-loading.md | Clark mount paths (unchanged), handler references |
| Planned/telegram-integration.md | Clark spawn references |
| ARCHITECTURE.md | Clark section, Docker Compose Topology |

## Decision U3: System State Access

**Question:** What filesystem does Unares see for system-wide observability?

**Answer: Option A — Full observability.** All entity vaults, IPC directories,
and PAW logs mounted read-only.

### Options Considered

| Option | Approach | Tradeoff |
|--------|----------|----------|
| A. Full observability | All vaults, IPC, logs, routing config — all read-only | Maximum visibility. Unares can answer any system question. |
| B. Selective observability | Only ai-workspace vault + summarized Logs/ per entity | Smaller mount surface. Limits cross-entity queries. |

### Why Option A

Unares is the Workspace Observer. System-wide visibility is its defining trait.
Mounting everything read-only lets Claude CLI naturally answer cross-entity queries
without custom aggregation code.

### Mount Matrix

```
Host Path                           Container Path              Mode
memory-vault/                       /vault/                     ro
ipc/                                /ipc/                       ro
logs/                               /logs/                      ro
nanoclaw-config/routing.json        /config/routing.json        ro
containers/unares/CLAUDE.md         /home/clark/.claude/CLAUDE.md  ro
containers/unares/settings.json     /home/clark/.claude/settings.json  ro
```

### Security: What Unares Does NOT See

- `config/ai-gateway-*/` — contains API keys (never mounted)
- `.env` — contains bot tokens and user IDs (never mounted)
- Docker socket — never exposed to any container
- Entity networks — ephemeral-companion-net only (no procenteo-net, inisio-net)

### What This Changes

- `src/paw/unares-handler.ts` → mount configuration (broader than Clark)
- No docker-compose changes (Unares is PAW-spawned)

## Decision U4: Command Vocabulary

**Question:** What can Michal ask Unares on Telegram?

**Answer: Option C — Open-ended + structured shortcuts.**

### Options Considered

| Option | Approach | Tradeoff |
|--------|----------|----------|
| A. Open-ended only | Unares answers any question from mounted files | Flexible but unpredictable output format |
| B. Structured commands only | Predefined set (e.g., /status, /costs) | Predictable but rigid |
| C. Open-ended + shortcuts | Free-form queries + documented shortcuts for common queries | Best of both — natural language for exploration, shortcuts for daily checks |

### Why Option C

Claude CLI naturally handles open-ended questions by reading files. Adding
documented shortcuts in the CLAUDE.md gives predictable, formatted output for
daily checks while keeping full flexibility for ad-hoc queries.

### Shortcut Definitions

Shortcuts are behavioral instructions in the CLAUDE.md, not code. Claude CLI
interprets them naturally.

| Shortcut | Reads | Output |
|----------|-------|--------|
| `status` | NORTHSTARs, recent Logs/, IPC activity | System overview — entities, focus areas, recent activity |
| `costs` | Logs/costs/ per entity | AIOO cost summaries — daily spend, budget remaining |
| `health` | IPC health-pong messages, watchdog state | Component health — AIOO, PAW, watchdog status |
| `routes` | routing.json | Routing table — targets, entities, humans, channels |
| `tasks [entity]` | vault/{entity}/Tasks/ | Active task graph for entity |
| `logs [component] [date]` | Logs/ per component | Recent log entries, filterable by component and date |

### What This Changes

- `containers/unares/CLAUDE.md` → shortcut definitions as behavioral instructions
- No code changes — shortcuts are prompt-level, not application-level

## References

- Unares spec: `./unares.md`
- Clark spec (pattern reference): `../Built/clark.md`
- NanoClaw-PAW spec: `../Built/nanoclaw-paw.md`
- Telegram integration spec: `./telegram-integration.md`
- Identity loading spec: `./identity-loading.md`
