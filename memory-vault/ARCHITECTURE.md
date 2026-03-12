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

## Services

- **Chronicle**: Always-on vault watcher + QMD hybrid search.
  Watches memory-vault for file changes (chokidar → JSONL audit events).
  Indexes all .md files via QMD (FTS5 + sqlite-vec + GGUF reranker).
  Serves MCP HTTP on :8181 (Docker network only).
  Per-entity collections. Named volume: memory-vault-index.
- **NanoClaw-PAW**: Host process. Messaging gateway + execution layer.
  Routes WhatsApp/Telegram/Discord → AIOO (IPC) or Clark (ephemeral spawn).
  Handles stage transitions (Docker Compose profile switches).
  Spec: `memory-vault/ai-workspace/Specifications/nanoclaw-paw.md`
- **ai-gateway**: Per-entity LLM proxy (LiteLLM). Routes to Gemini (AIOO brain)
  and Claude (Agent SDK workers). Cost tracking per entity.
  Spec: `memory-vault/ai-workspace/Specifications/ai-gateway.md`
- **Context Extractor**: ⏸ Deferred. Future vault intelligence layer.
  Design after AIOO is built.

## Scale Phases

### Phase 1: Single VPS (current)

All containers on one Docker host via Docker Compose.
0-10 agents, $5-50/mo.
Trigger to Phase 2: DB write contention, single point of failure,
or ops time exceeding hosting cost savings.

### Phase 2: Service Separation

Database to managed or separate VPS. Workers separated.
10-50 agents, $100-500/mo.
Trigger to Phase 3: multi-team, GPU scheduling, or app
containers moving to own VPS.

### Phase 3: Multi-Node

App containers become standalone deployments on own VPS.
Orchestration: evaluate options based on actual requirements at the time.

## Architectural Patterns

11 patterns in 3 tiers, 5 anti-patterns.
Full reference: `.claude/skills/architecture-design/reference.md`
Aspiration scores: Simplicity, Security, Privacy, Reliability.
