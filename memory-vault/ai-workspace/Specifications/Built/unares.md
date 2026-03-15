# Unares — Specification

> Component: unares
> Entity: ai-workspace (system-wide, applies to all entities)
> Status: Planned
> Dependencies: NanoClaw-PAW (Built, Layer 4), Clark (Built, Layer 5),
>               Identity Loading (Planned), Telegram Integration (Planned)
> Decisions: `./unares-decisions.md`

## Problem Statement

The Personal AI Workspace has no admin interface for system-wide visibility. Michal
(ai-architect) must manually inspect vault files, IPC directories, logs, and container
status via CLI sessions (Heavy-HITL) to understand system state. AIOO handles entity
operations, Clark handles philosophical thinking, but neither provides cross-entity
system overview or diagnostic capabilities. Without Unares, routine status checks
("What's procenteo's stage?", "Any watchdog alerts?", "Show AIOO costs") require
full CLI sessions instead of quick Telegram queries — wasting HRoT on tasks that
should take seconds, not minutes.

## Acceptance Criteria

1. Michal can send a Telegram DM to the Unares companion AI and receive a system-wide
   status report covering all entities, active tasks, recent IPC traffic, and AIOO cost
   summaries — within the same chat, using the ephemeral-companion:latest image with
   full vault read-only access.

2. Unares is spawned by NanoClaw-PAW on Telegram message, uses Claude Code CLI with a
   CLAUDE.md that @-imports SOUL.md and UNARES_IDENTITY.md, runs on
   ephemeral-companion-net with credential proxy access, and dies after 30 minutes of
   inactivity — same lifecycle as Clark but with system-wide read-only mounts instead of
   entity-scoped Distilled-only.

3. Structured shortcut commands (status, costs, health, routes, tasks, logs) produce
   predictable formatted output, while free-form queries are answered by Claude reading
   the mounted vault, IPC, and log files — with the CLAUDE.md identity scoping Unares as
   a read-only observer that never modifies system state.

## Constraint Architecture

### Must-Do

- Ephemeral container using ephemeral-companion:latest image (shared with Clark,
  Decision U2)
- Spawned by PAW unares-handler.ts on Telegram DM from Michal
- Claude Code CLI runtime with CLAUDE.md @-importing SOUL.md + UNARES_IDENTITY.md
- Full vault mounted read-only at /vault/ (all entities — Decision U3)
- IPC directories mounted read-only at /ipc/ (audit trail observation)
- PAW logs mounted read-only at /logs/
- Routing config mounted read-only at /config/routing.json
- ephemeral-companion-net network (renamed from clark-net, shared with Clark —
  Decision U2)
- Credential proxy via host:3001 (Claude API access)
- 30min idle timeout (same lifecycle as Clark)
- settings.json with read-only permissions (same as Clark)
- ai-architect profile only (Michal) — enforced by routing config allowedUsers
- Structured shortcuts documented in CLAUDE.md: status, costs, health, routes,
  tasks, logs (Decision U4)
- Rename clark:latest → ephemeral-companion:latest (Dockerfile path + image tag)
- Rename clark-net → ephemeral-companion-net (docker-compose.yml + handlers)
- Update clark-handler.ts to reference new image and network names
- Update Built/clark.md and Built/nanoclaw-paw.md specs to reflect renames
- Container name format: `unares-{ts}` (single instance, Michal only)
- Functions < 30 lines, files < 300 lines

### Must-Not-Do

- Never modify vault files, IPC directories, or logs (read-only observer)
- Never access Docker socket or run docker commands from inside container
- Never mount ai-gateway config directories (contain API keys)
- Never mount .env file (contains bot tokens, user IDs)
- Never spawn containers or agents (PAW's job, not Unares')
- Never access entity networks (procenteo-net, inisio-net) —
  ephemeral-companion-net only
- Never send messages proactively (ephemeral, responds only when asked)
- Never expose system secrets in responses (API keys, tokens, credentials)

### Preferences

- Prefer markdown-formatted responses for Telegram readability
- Prefer ASCII tables for structured data (status, costs, routes)
- Prefer ISO timestamps in all output
- Prefer concise summaries with "ask for details" follow-up option
- Prefer the same idle timeout logic as clark-handler.ts (reuse pattern,
  not code) for maintainability

### Escalation Triggers

- If vault mount fails at spawn: log error, respond "Vault access unavailable"
  to Telegram, do not crash PAW
- If Claude CLI fails inside container: PAW catches docker exec error, responds
  "Unares is unavailable" to Telegram
- If Unares container spawn fails: log error with docker error details, respond
  "Unares could not start" to Telegram

## Data Residency

| Data Type | Host Path | Container Path | Mode | File Types |
|-----------|-----------|----------------|------|------------|
| All entity vaults | `memory-vault/` | `/vault/` | ro | .md |
| IPC audit trail | `ipc/` | `/ipc/` | ro | .json |
| Runtime logs | `logs/` | `/logs/` | ro | .log (watchdog logs; PAW logs to stdout) |
| Routing config | `nanoclaw-config/routing.json` | `/config/routing.json` | ro | .json |
| Unares identity | `containers/unares/CLAUDE.md` | `/home/clark/.claude/CLAUDE.md` | ro | .md |
| CLI settings | `containers/unares/settings.json` | `/home/clark/.claude/settings.json` | ro | .json |

Container user: `clark` (home `/home/clark/`), inherited from the
`ephemeral-companion:latest` image. User name is a historical artifact of the
image rename from `clark:latest`; rename to a generic user is deferred — no
functional impact.

Unares produces NO persistent output. All responses go to Telegram via PAW.
Conversation logs are written by PAW's telegram-bots.ts to
`memory-vault/ai-workspace/Logs/telegram/unares/YYYY-MM-DD.md` (per telegram
integration spec, Decision TG8).

## Clark vs Unares — Ephemeral Companion Comparison

Both share ephemeral-companion:latest image and ephemeral-companion-net network.
The differences are in mounts, identity, and access scope.

| Aspect | Clark | Unares |
|--------|-------|--------|
| Vault access | Entity-scoped Distilled/ only (ro) | All of memory-vault/ (ro) |
| IPC access | None | All IPC dirs (ro, observation) |
| Logs access | None | PAW logs (ro) |
| Config access | None | routing.json (ro) |
| Identity | SOUL.md + CLARK_IDENTITY.md | SOUL.md + UNARES_IDENTITY.md |
| Container name | `clark-{human}-{ts}` | `unares-{ts}` |
| Users | Multiple humans (Michal, Mateusz, Andras) | Michal only |
| Purpose | Clarity Architect (think partner) | Workspace Observer (system admin) |
| Shortcuts | None (open-ended conversation) | status, costs, health, routes, tasks, logs |
| Network | ephemeral-companion-net | ephemeral-companion-net |

## Shortcut Definitions

Shortcuts are behavioral instructions in containers/unares/CLAUDE.md. Claude CLI
interprets them as structured query patterns against mounted files.

| Shortcut | Reads | Output |
|----------|-------|--------|
| `status` | NORTHSTARs, recent Logs/, IPC activity | System overview — entities, focus areas, recent activity |
| `costs` | `Logs/costs/` per entity | AIOO cost summaries — daily spend, budget remaining |
| `health` | IPC health-pong messages, watchdog state | Component health — AIOO, PAW, watchdog status |
| `routes` | `/config/routing.json` | Routing table — targets, entities, humans, channels |
| `tasks [entity]` | `vault/{entity}/Tasks/` | Active task graph for entity |
| `logs [component] [date]` | `Logs/` per component | Recent log entries, filterable |

## Decomposition

| # | Subtask | Scope | Est | Notes |
|---|---------|-------|-----|-------|
| 1 | Rename `containers/clark/` → `containers/ephemeral-companion/`, update Dockerfile image tag to `ephemeral-companion:latest` | full | 30min | Move Dockerfile + any supporting files. Update `.dockerignore` if present. |
| 2 | Rename `clark-net` → `ephemeral-companion-net` in `docker-compose.yml` | full | 15min | Network definition + all service references that use clark-net |
| 3 | Update `clark-handler.ts` to use `ephemeral-companion:latest` image and `ephemeral-companion-net` network | full | 30min | Image ref, network ref. Container name prefix stays `clark-{human}-{ts}`. |
| 4 | Create `containers/unares/CLAUDE.md` with @-imports and admin shortcuts | full | 45min | @-imports use absolute container paths: `@/vault/SOUL.md`, `@/vault/UNARES_IDENTITY.md`, `@/vault/ai-workspace/AI_WORKSPACE_NORTHSTAR.md`, `@/vault/ai-workspace/AI_WORKSPACE_GLOSSARY.md`. Shortcut definitions. Mount-awareness instructions. |
| 5 | Create `containers/unares/settings.json` (read-only permissions) | full | 15min | Same pattern as `containers/clark/settings.json`. No MCP servers. |
| 6 | Implement `unares-handler.ts` in `src/paw/` | full | 1.5h | `getOrSpawnUnares()`, `buildUnaresArgs()`, `sendToUnares()`, `stopIdleUnares()`. Mounts per Data Residency table. 30min idle timeout. |
| 7 | Wire unares-handler into PAW `index.ts` (import + init + shutdown) | full | 15min | Same 3-touchpoint pattern as clark-handler. |
| 8 | Update `Built/clark.md` spec to reflect ephemeral-companion rename | full | 15min | Image name, network name, Dockerfile path. |
| 9 | Update `Built/nanoclaw-paw.md` spec to reflect rename + unares handler | full | 15min | New handler module, network name, image name. |
| 10 | Write tests | full | 1.5h | Unit + integration tests per evaluation design below. |

Prior-layer dependencies (already built):
- NanoClaw-PAW `src/paw/index.ts` (Layer 4) — 3 PAW touchpoints, add unares-handler
- `src/paw/clark-handler.ts` (Layer 5) — pattern reference for spawn/idle/exec
- `containers/clark/` (Layer 5) — Dockerfile to rename
- `docker-compose.yml` (Layer 1) — clark-net network definition to rename

Cross-spec dependencies (planned):
- Identity Loading — creates SOUL.md and UNARES_IDENTITY.md (must be built first)
- Telegram Integration — creates Unares Telegram bot handler (stub in subtask 10,
  replaced by this spec's full implementation via unares-handler.ts)

Intra-layer build order: Identity Loading → Unares → Telegram Integration.
Identity Loading creates identity files. Unares renames image/network and creates
full handler. Telegram Integration wires bots (uses existing unares-handler,
skips stub subtask 10).

## Evaluation Design

### Unit Tests (unares-handler.ts)

| # | Test | Expected Result |
|---|------|-----------------|
| T1 | `buildUnaresArgs()` uses `ephemeral-companion:latest` image | Image name matches |
| T2 | `buildUnaresArgs()` mounts `memory-vault/` at `/vault/` read-only | Mount in docker args |
| T3 | `buildUnaresArgs()` mounts `ipc/` at `/ipc/` read-only | Mount in docker args |
| T4 | `buildUnaresArgs()` mounts `logs/` at `/logs/` read-only | Mount in docker args |
| T5 | `buildUnaresArgs()` mounts `routing.json` at `/config/routing.json` ro | Mount in docker args |
| T6 | `buildUnaresArgs()` uses `ephemeral-companion-net` network | Network in docker args |
| T7 | `buildUnaresArgs()` does NOT mount ai-gateway config dirs | No ai-gateway mount |
| T8 | Container name format is `unares-{ts}` | Name pattern matches |

### Unit Tests (rename verification)

| # | Test | Expected Result |
|---|------|-----------------|
| T9 | `buildClarkArgs()` uses `ephemeral-companion:latest` | Updated image name |
| T10 | `buildClarkArgs()` uses `ephemeral-companion-net` | Updated network name |
| T11 | Clark container name still `clark-{human}-{ts}` | Container name unchanged |

### Unit Tests (identity)

| # | Test | Expected Result |
|---|------|-----------------|
| T12 | Unares CLAUDE.md has @-import for SOUL.md | Import path present |
| T13 | Unares CLAUDE.md has @-import for UNARES_IDENTITY.md | Import path present |
| T14 | Unares settings.json has read-only permissions | Permissions match Clark pattern |

### Integration Tests

| # | Test | Expected Result |
|---|------|-----------------|
| T15 | Spawn Unares container (mock docker exec) | Container starts with correct mounts |
| T16 | Send message → `sendToUnares()` → capture stdout | Response returned |
| T17 | 30min idle timeout triggers `stopIdleUnares()` | Container stopped |
| T18 | Clark still works with ephemeral-companion:latest | Rename doesn't break Clark |
| T19 | Both Clark and Unares on ephemeral-companion-net | Network shared correctly |
| T20 | Unauthorized user (not Michal) message → silent drop | Routing config enforced |

## References

- Decisions: `./unares-decisions.md`
- Clark spec (pattern reference): `../Built/clark.md`
- NanoClaw-PAW spec: `../Built/nanoclaw-paw.md`
- Telegram integration spec: `./telegram-integration.md`
- Identity loading spec: `./identity-loading.md`
- IPC protocol spec: `../Built/ipc-protocol.md`
