# Personal AI Workspace — Architecture

## Entity-Centric Model

Everything is organized around entities. Each entity owns its vision, glossary, and vault. The workspace itself is an entity (`ai-workspace`), the default when working on infrastructure.

```
memory-vault/
├── ai-workspace/          ← workspace entity (default)
├── procenteo/             ← app entity (Mateusz)
└── inisio/                ← app entity (Andras)
```

No global NORTHSTAR. Each entity has `{ENTITY}_NORTHSTAR.md`.

## Agent Architecture

Two companion AI roles: AIOO (operational brain) and Clark (clarity architect).
NanoClaw-PAW is the host process that connects them to humans and infrastructure.

### AIOO (per app-factory entity)
- ✅ Built (Layer 3 complete). Node.js daemon with 8 modules, all active:
  Event Loop (async), IPC Handler, Task Graph Manager, Health Monitor,
  Brain Client (Gemini via ai-gateway), HITL Manager (3-tier rules + escalation),
  Stage Controller (sequential validation + state persistence), Cost Tracker
  (per-stage + amortized, daily summaries, budget alerts).
- Brain: Gemini 3.1 Pro via ai-gateway. Model `gemini-planning` for judgment,
  `gemini-classifier` for classification. Auth via `AI_GATEWAY_API_KEY` env var.
- Spawns Agent SDK agents via NanoClaw-PAW into App Dev Stage containers.
- Vault access: Full read-write for its entity. Tasks in `vault/Tasks/`,
  cost data in `vault/Logs/costs/`, stage transitions in `vault/Logs/`.
- Config: `config/aioo-{entity}.json` (poll/health intervals, brain model,
  daily budget, HITL rules — 12 situation-to-tier mappings).
- Identity: `containers/aioo/CLAUDE.md`
- Spec: `memory-vault/ai-workspace/Specifications/aioo.md`
- Tests: 56/56 pass (8 test files, local execution via `IPC_LIB_PATH` auto-detection).

### Clark (per human, lightweight)
- ✅ Built (Layer 5 complete). Lean container image (`clark:latest`):
  node:20-alpine + Claude Code CLI. No embedded NanoClaw.
  Spawned by NanoClaw-PAW clark-handler on message, dies after 30min idle.
- Vault access: Distilled/ only (read-only, air-gapped, clark-net network).
  Multi-entity mounts for ai-architect profile (all entities).
  Co-founder profile gets single entity Distilled/ only.
- No Chronicle, no ai-gateway, no AIOO network access.
- Credential proxy via clark-net → host:3001.
- Identity: `containers/clark/CLAUDE.md`
- Settings: `containers/clark/settings.json` (no MCP servers, read-only permissions)
- Spec: `memory-vault/ai-workspace/Specifications/clark.md`
- Tests: 14 Clark handler + 215 upstream = 229/229 pass.

### NanoClaw-PAW (host process)
- ✅ Built (Layer 4 complete). Git subtree from upstream NanoClaw at
  `services/nanoclaw-paw/`. PAW extensions in `src/paw/` (7 modules):
  persistent-registry (Docker Compose container tracking),
  ipc-poller (workspace Typed Envelope IPC, 1s poll),
  stage-handler (compose profile transitions, health checks, vault logging),
  agent-spawn-handler (docker exec Claude CLI in stage containers),
  clark-handler (ephemeral containers on clark-net, 30min idle timeout),
  config (routing JSON, entity discovery), index (init/shutdown wiring).
- 3 touchpoints in upstream src/index.ts (import, initPaw, shutdownPaw).
- Credential proxy: API keys never enter containers (upstream pattern, port 3001).
- Routing config: `nanoclaw-config/routing.json` (channel → Clark/AIOO mapping).
- run.sh: restart-on-exit wrapper (Decision P6).
- Deferred: messaging handler (human-reply IPC stub — wired when channels configured).
- Tests: 14 PAW + 201 upstream = 215/215 pass.
- Spec: `memory-vault/ai-workspace/Specifications/nanoclaw-paw.md`

## Human Profiles

| Profile | Who | Entity Selection | Clark CLI | AIOO Access |
|---------|-----|-----------------|-----------|-------------|
| ai-architect | Michal | Selectable (all) | Full | Full R/W |
| co-founder | Mateusz, Andras | Auto-selected | Disabled | Sandbox R/W |

## Vault Structure (per entity)

```
memory-vault/{entity}/
├── {ENTITY}_NORTHSTAR.md    ← human-owned vision
├── {ENTITY}_GLOSSARY.md     ← human-owned terminology
├── Specifications/           ← 5-primitive component specs (agent-executable)
├── Research/                 ← research agent output
├── Narratives/               ← architectural narratives and context docs
├── Templates/Claude/         ← CLAUDE.md stack for this entity
├── Raw/                      ← input (sessions, submissions)
├── Memories/                 ← Context Extractor formed memories
├── Distilled/                ← refined, classified knowledge
├── Logs/                     ← activity + chronicle events
└── Bin/                      ← processed/archived raw files
```

## Context Flow

```
CLAUDE.md (thin, @-imports vault)
  → @NORTHSTAR (entity vision)
  → @GLOSSARY (entity terminology)
  → @ARCHITECTURE (this file)
  → .claude/rules/ (conditional, path-triggered)
  → .claude/skills/ (on-demand, user-invoked)
```

## IPC Protocol

Typed Envelope filesystem IPC — all inter-component communication uses JSON files.
Library: `lib/ipc/` (createEnvelope, writeMessage, readMessages, processMessage).
Per-entity namespaces: `ipc/aioo-{entity}/{to-paw,from-paw}/`.
Atomic writes (.tmp → .json), 1s polling, processed/ audit trail.
Spec: `memory-vault/ai-workspace/Specifications/ipc-protocol.md`

## App Workspaces

Agent-produced code lives outside the vault in `app-workspaces/`:

```
app-workspaces/
├── procenteo/
│   ├── procenteo-app-demo/       ← PoC code
│   ├── procenteo-app-testing/    ← MVP code
│   ├── procenteo-app-launch/     ← Product code
│   └── procenteo-app-scaling/    ← Distribution code
└── inisio/
    ├── inisio-app-demo/
    └── ...
```

Mounted as `/workspace` (r/w) in stage containers. Vault mounted as `/vault` (r/o).
Separation principle: vault = knowledge (.md only), workspace = code (any file type).
Each workspace has a clear path to its own git repo when the app matures.
Gitignored in the workspace repo — tracked in app-specific repos.

## Docker Compose Topology

Per-entity networks (procenteo-net, inisio-net). Profile-based activation.
No profile = Chronicle only. `--profile {entity}` adds AIOO + ai-gateway.
`--profile {app}-app-{stage}` adds individual stage containers.
Clark is NOT in compose — spawned by NanoClaw-PAW with `--network clark-net`.
Security: no docker.sock, no host ports, entity network isolation, vault r/o for Chronicle.
Health checks on all services.

## Services

- **Chronicle**: ✅ Running. Always-on vault watcher + QMD hybrid search.
  Watches memory-vault for file changes (chokidar → JSONL audit events).
  Indexes all .md files via QMD (FTS5 + sqlite-vec + GGUF reranker).
  Serves MCP HTTP on :8181 (Docker network only).
  Dual-network (procenteo-net + inisio-net). Vault r/o with targeted Logs/ writable mounts.
  Per-entity collections. Named volume: memory-vault-index.
- **ai-gateway**: ✅ Built. Per-entity LLM proxy (LiteLLM).
  Routes to Gemini (AIOO brain) and Claude (Agent SDK workers).
  Config: `config/ai-gateway-{entity}/config.yaml`. Per-entity API keys.
  Cost tracking per entity (ephemeral — persistent DB planned).
  Spec: `memory-vault/ai-workspace/Specifications/ai-gateway.md`
- **Context Extractor**: ⏸ Deferred. Future vault intelligence layer.
  Design after AIOO is built.

## Build Order

Layered by dependency. Each layer is testable before the next begins.

```
Layer 0: IPC Shared Library                    ✅ Built
Layer 1: Docker Compose + Chronicle + ai-gateway  ✅ Built
Layer 2: AIOO Daemon Skeleton                  ✅ Built
Layer 3: AIOO Brain + HITL + Stage + Cost      ✅ Built
Layer 4: NanoClaw-PAW                          ✅ Built
Layer 5: Clark                                 ✅ Built
Layer 6: Stage Lifecycle + App Dev Stages      ✅ Built
Layer 7: Host Watchdog                         ⬜
```

**Critical dependency**: Clark has NO independent lifecycle. NanoClaw-PAW spawns
Clark containers on message, manages their idle timeout, provides credential
proxy, and configures vault mounts. Clark cannot be built or tested without
NanoClaw-PAW. NanoClaw-PAW MUST be built before Clark.

## Scale Phases

Phase 1 → 2: DB write contention, SPOF pain, or ops time > hosting savings.
Phase 2 → 3: Multi-team, GPU needs, or app containers moving to own VPS.
Full detail: `.claude/skills/architecture-design/reference.md` (Scale Transitions)

## Design Philosophy

JTBD frames every outcome — from entity vision to individual agent tasks.
Specification Engineering (5 Primitives) translates JTBD into agent-executable specs.
Reference: `memory-vault/ai-workspace/Specifications/jtbd-specification-engineering.md`

## Architectural Patterns

11 patterns in 3 tiers, 5 anti-patterns. Aspiration scores: Simplicity, Security, Privacy, Reliability.
Full reference: `.claude/skills/architecture-design/reference.md`
