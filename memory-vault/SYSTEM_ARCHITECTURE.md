# Personal AI Workspace — System Architecture

## Entity-Centric Model

Everything is organized around entities. Each entity owns its vision, glossary,
and vault. The workspace itself is a meta-entity (`ai-workspace`), the default
when working on infrastructure.

```
memory-vault/
├── ai-workspace/          ← meta-entity (workspace itself)
├── procenteo/             ← app-factory entity
└── inisio/                ← app-factory entity
```

No global NORTHSTAR. Each entity has `{ENTITY}_NORTHSTAR.md`.

## Companion AI Roles

Three companion AI roles operate within the workspace:

- **AIOO** (per app-factory entity): AI Operating Officer — operational brain.
  Node.js daemon managing tasks, stages, costs, and HITL. Communicates with
  humans via NanoClaw-PAW Telegram integration. Spawns Agent SDK agents into
  App Dev Stage containers. Brain: Gemini via ai-gateway.

- **Clark** (per human): Clarity Architect — philosophical think partner.
  Ephemeral container (ephemeral-companion:latest), spawned by NanoClaw-PAW
  on message, 30min idle timeout. Distilled/ access only (read-only).

- **Unares** (single instance): Workspace Observer — system-wide visibility
  and admin interface. Ephemeral container (shared image with Clark), spawned
  by NanoClaw-PAW on Telegram DM. Full vault read-only. Michal only.

## NanoClaw-PAW

Host process: messaging gateway and ephemeral container router. Git subtree
from upstream NanoClaw with PAW extensions in `src/paw/`. Connects companion
AIs to humans via Telegram. Credential proxy on port 3001 — API keys never
enter containers. Routing config: `nanoclaw-config/routing.json`.

## Identity System

Shared personality anchor: `SOUL.md` (vault root). Per-companion identity:
`{COMPANION}_IDENTITY.md` (vault root: AIOO_IDENTITY.md, CLARK_IDENTITY.md,
UNARES_IDENTITY.md). AIOO loads via brain-client assembly. Clark and Unares
load via CLAUDE.md @-imports.

## Human Profiles

| Profile | Who | Entity Selection | Clark | AIOO Access |
|---------|-----|-----------------|-------|-------------|
| ai-architect | Michal | Selectable (all) | Full | Full R/W |
| co-founder | Mateusz, Andras | Auto-selected | Yes | Sandbox R/W |

## Vault Structure (per entity)

```
memory-vault/{entity}/
├── {ENTITY}_NORTHSTAR.md    ← human-owned vision
├── {ENTITY}_GLOSSARY.md     ← human-owned terminology
├── Specifications/           ← 5-primitive component specs
├── Research/                 ← research agent output
├── Narratives/               ← architectural narratives
├── Claude/                   ← Claude Code session context
├── Raw/                      ← input (sessions, submissions)
├── Memories/                 ← Context Extractor formed memories
├── Distilled/                ← refined, classified knowledge
├── Logs/                     ← activity logs (append-only)
└── Bin/                      ← processed/archived files
```

## Perspective Framing

The persistent .md files loaded into every session form the **Agent's World
Model** — the structural context that defines WHO the agent is and WHAT
exists around it. **Perspective Framing** is the practice of scoping the
Agent's World Model to each consumer's operational perspective.

Agent's World Model (loaded every session):
```
CLAUDE.md (thin, @-imports vault)
  → @NORTHSTAR (entity vision)
  → @GLOSSARY (entity terminology)
  → @{PERSPECTIVE}_ARCHITECTURE.md (one per consumer)
  → .claude/rules/ (conditional, path-triggered)
  → .claude/skills/ (on-demand, user-invoked)
~/.claude/CLAUDE.md (global, perspective-agnostic)
```

Task context (assembled per-invocation, defines WHAT TO DO NOW):
brain prompts, spawn instructions, IPC messages, conversation history.

### Perspective Map

Each consumer loads exactly one architecture file. The perspective follows
the **location** (WHERE the session runs), not the user (WHO runs it).

| Perspective  | File                        | Consumers                                  |
|-------------|-----------------------------|--------------------------------------------|
| System      | SYSTEM_ARCHITECTURE.md       | Heavy-HITL (project root), Unares           |
| Operational | OPERATIONAL_ARCHITECTURE.md  | AIOO daemon, spawned agents in AIOO         |
| Stage       | APP_DEV_ARCHITECTURE.md      | App Dev Stage containers, Heavy-HITL in stages |
| Strategic   | HIGH_LEVEL_ARCHITECTURE.md   | Clark (all humans)                          |

Global CLAUDE.md (`~/.claude/CLAUDE.md`) is perspective-agnostic — applies to
all sessions regardless of perspective. Architecture-design sessions must
consider it when updating the Agent's World Model.

## IPC Protocol

Typed Envelope filesystem IPC. Library: `lib/ipc/`. Per-entity namespaces:
`ipc/aioo-{entity}/{to-paw,from-paw}/`. Atomic writes, 1s polling, audit trail.

## App Workspaces

Agent-produced code lives outside the vault in `app-workspaces/`:
```
app-workspaces/{entity}/{appname}-app-{stage}/
```
Mounted as `/workspace` (r/w) in stage containers. Vault at `/vault` (r/o).
Separation: vault = knowledge (.md only), workspace = code (any file type).

## Docker Compose Topology

Per-entity networks (procenteo-net, inisio-net). Profile-based activation.
Clark and Unares are NOT in compose — spawned by NanoClaw-PAW with
`--network ephemeral-companion-net`.
Security: no docker.sock, no host ports, entity network isolation.

## Services

- **Chronicle**: Always-on vault watcher + QMD hybrid search. MCP HTTP on :8181.
- **ai-gateway**: Per-entity LLM proxy. Routes to Gemini (AIOO) and Claude (agents).
- **Host Watchdog**: Bash cron script. Monitors AIOO + PAW, IPC alerts + Telegram fallback.
- **Context Extractor**: Deferred. Future vault intelligence layer.

## Telegram Integration

6 grammY bots managed at PAW-level: 3 Clark DMs (per human), 2 AIOO groups
(per entity), 1 Unares admin (Michal only). Long polling. User allowlisting
via numeric `user.id`. Conversation logs to vault.

## Scale Phases

Phase 1 (current): Single Mac, Docker Compose, 0-10 agents.
Phase 1 → 2: DB write contention, SPOF pain, or ops time > hosting savings.
Phase 2 → 3: Multi-team, GPU needs, or app containers moving to own VPS.

## Design Philosophy

JTBD frames every outcome. Specification Engineering (5 Primitives) translates
JTBD into agent-executable specs. Build order: see `Specifications/`.
