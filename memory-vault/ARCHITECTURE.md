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
- Node.js daemon (state, routing, task graph) + Gemini 3.1 Pro brain (judgment)
- Spawns Agent SDK agents via NanoClaw-PAW into App Dev Stage containers
- Vault access: Full read-write for its entity
- Identity: `containers/aioo/CLAUDE.md`
- Spec: `memory-vault/ai-workspace/Specifications/aioo.md`

### Clark (per human, lightweight)
- Ephemeral container spawned by NanoClaw-PAW on message, dies after 30min idle
- Vault access: Distilled/ + Memories/ (read-only, air-gapped, --network none)
- Role: Help human think clearly — asks questions, doesn't prescribe
- Identity: `containers/clark/CLAUDE.md`
- Spec: `memory-vault/ai-workspace/Specifications/clark.md`

### NanoClaw-PAW (host process)
- Targeted fork of NanoClaw adding persistent container routing
- Four handlers: Messaging, Agent spawn, Clark lifecycle, Stage transitions
- Credential proxy: API keys never enter containers
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

## Docker Compose Topology

Per-entity networks (procenteo-net, inisio-net). Profile-based activation.
No profile = Chronicle only. `--profile {entity}` adds AIOO + ai-gateway.
`--profile {app}-app-{stage}` adds individual stage containers.
Clark is NOT in compose — spawned by NanoClaw-PAW with `--network none`.
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
