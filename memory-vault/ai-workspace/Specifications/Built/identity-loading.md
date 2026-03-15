# Identity Loading — Specification

> Component: identity-loading
> Entity: ai-workspace (infrastructure, applies to all entities)
> Status: Planned
> Dependencies: AIOO (Built, Layer 3), NanoClaw-PAW (Built, Layer 4), Clark (Built, Layer 5)
> Decisions: `./identity-loading-decisions.md`

## Problem Statement

Companion AIs (AIOO, Clark, Unares) have no shared personality anchor or structured
identity loading. AIOO's brain-client.js uses a 3-line hardcoded system prompt
(`"You are AIOO, the AI Operating Officer for entity: ${ctx.entity}."`) that
doesn't include SOUL.md, companion identity, NORTHSTAR, or GLOSSARY. Clark's
CLAUDE.md defines its role inline without referencing shared identity files.
Unares has no identity infrastructure. Each companion AI's personality is ad-hoc,
not derived from canonical source files that humans can edit in one place and have
changes propagate to all runtimes on next startup.

## Acceptance Criteria

1. AIOO's system prompt is assembled at runtime by reading 5 identity files in fixed
   order (SOUL.md → AIOO_IDENTITY.md → NORTHSTAR → GLOSSARY → CLAUDE.md operational
   sections), with a SHA-256 hash of the assembled prompt logged on every startup
   and a `debug-prompt` IPC command returning the full prompt on demand.

2. Clark's CLAUDE.md @-imports SOUL.md and CLARK_IDENTITY.md from vault root
   (`/vault/SOUL.md`, `/vault/CLARK_IDENTITY.md`), and the clark-handler mounts
   these files read-only into every spawned Clark container.

3. All companion AIs share personality via a single SOUL.md at vault root
   (`memory-vault/SOUL.md`), with companion-specific identity in separate
   `{COMPANION}_IDENTITY.md` files at vault root, and editing any source file
   propagates to the next agent startup without Docker image rebuilds.

## Constraint Architecture

### Must-Do

- AIOO system prompt assembled from 5 files in this exact order:
  1. `/identity/SOUL.md` — shared personality
  2. `/identity/AIOO_IDENTITY.md` — companion-specific identity
  3. `/vault/{ENTITY}_NORTHSTAR.md` — entity vision
  4. `/vault/{ENTITY}_GLOSSARY.md` — entity terminology
  5. `/identity/CLAUDE.md` — operational context
- Language field added to `aioo-{entity}.json` config (`"language": "pl"` or `"en"`)
- Language instruction appended after the 5-file assembly (Decision IL2)
- `brain-client.js` renamed to `aioo-brain-client.js` — all imports updated
- SHA-256 hash of assembled prompt logged on startup (Decision IL3)
- `debug-prompt` IPC command returns full prompt + metadata (Decision IL3)
- AIOO identity files mounted as `:ro` volumes, not baked into Docker image
- SOUL.md lives at `memory-vault/SOUL.md` (vault root, shared across all entities)
- `{COMPANION}_IDENTITY.md` lives at `memory-vault/{COMPANION}_IDENTITY.md` (vault root)
- Clark CLAUDE.md uses `@`-import for SOUL.md and CLARK_IDENTITY.md
- Clark handler mounts SOUL.md and CLARK_IDENTITY.md into spawned containers
- Functions < 30 lines, files < 300 lines

### Must-Not-Do

- Never hardcode system prompt text in aioo-brain-client code — all identity
  content must come from mounted files
- Never give AIOO access to other entity vaults via mount changes
- Never duplicate SOUL.md or IDENTITY files per entity — single source at vault root
- Never modify NORTHSTAR or GLOSSARY files (human-owned, read-only)
- Never bake identity files into Docker images (must be volume-mountable for hot-reload)
- Never downgrade gracefully without logging — if a file is missing, it must be visible

### Preferences

- Prefer failing loudly (log error + fallback to minimal prompt) over silent
  degradation if identity files are missing
- Prefer synchronous file reads at startup over file watchers (identity changes
  are rare, restart is the propagation mechanism)
- Prefer `node:crypto.createHash('sha256')` for hashing (stdlib, no dependencies)
- Prefer a single `assemblePrompt()` function that returns `{ prompt, hash, files }`
  to keep assembly logic testable and contained

### Escalation Triggers

- If SOUL.md or AIOO_IDENTITY.md is missing at startup: log error, start with
  minimal 3-line fallback prompt, send health warning via IPC to NanoClaw-PAW
- If assembled prompt exceeds 50KB: log warning (Gemini context budget concern)
- If hash changes between restarts without file edits: flag as mount misconfiguration

## Container Mount Schema

### AIOO (docker-compose.yml — additions to existing service)

| Host Path | Container Path | Mode | Purpose |
|-----------|---------------|------|---------|
| `memory-vault/SOUL.md` | `/identity/SOUL.md` | ro | Shared personality |
| `memory-vault/AIOO_IDENTITY.md` | `/identity/AIOO_IDENTITY.md` | ro | Companion identity |
| `containers/aioo/CLAUDE.md` | `/identity/CLAUDE.md` | ro | Operational context |

Existing mounts (no change):

| Host Path | Container Path | Mode | Purpose |
|-----------|---------------|------|---------|
| `memory-vault/{entity}` | `/vault` | rw | Entity vault (NORTHSTAR, GLOSSARY, Tasks, Logs) |
| `ipc/aioo-{entity}` | `/ipc` | rw | IPC channels |
| `lib/ipc` | `/app/lib/ipc` | ro | IPC library |
| `config/aioo-{entity}.json` | `/config/aioo.json` | ro | AIOO config |

### Clark (clark-handler.ts docker run — additions to existing spawn logic)

| Host Path | Container Path | Mode | Purpose |
|-----------|---------------|------|---------|
| `memory-vault/SOUL.md` | `/vault/SOUL.md` | ro | Shared personality (@-imported by CLAUDE.md) |
| `memory-vault/CLARK_IDENTITY.md` | `/vault/CLARK_IDENTITY.md` | ro | Companion identity (@-imported by CLAUDE.md) |

Existing mounts (no change):

| Host Path | Container Path | Mode | Purpose |
|-----------|---------------|------|---------|
| `containers/ephemeral-companion/CLAUDE.md` | `/home/clark/.claude/CLAUDE.md` | ro | Clark CLAUDE.md |
| `containers/ephemeral-companion/settings.json` | `/home/clark/.claude/settings.json` | ro | Claude Code settings |
| `memory-vault/{entity}/Distilled` | `/vault/{entity}/Distilled` | ro | Per-entity knowledge |

## Data Residency

| Data Type | Host Path | Container Path | Mode | File Types |
|-----------|-----------|---------------|------|------------|
| Shared personality | `memory-vault/SOUL.md` | `/identity/SOUL.md` (AIOO), `/vault/SOUL.md` (Clark) | ro | .md only |
| Companion identity | `memory-vault/{COMPANION}_IDENTITY.md` | `/identity/{COMPANION}_IDENTITY.md` (AIOO), `/vault/{COMPANION}_IDENTITY.md` (Clark) | ro | .md only |
| Entity vision | `memory-vault/{entity}/{ENTITY}_NORTHSTAR.md` | `/vault/{ENTITY}_NORTHSTAR.md` | ro | .md only |
| Entity terminology | `memory-vault/{entity}/{ENTITY}_GLOSSARY.md` | `/vault/{ENTITY}_GLOSSARY.md` | ro | .md only |
| Operational context | `containers/aioo/CLAUDE.md` | `/identity/CLAUDE.md` | ro | .md only |
| Prompt hash log | `memory-vault/{entity}/Logs/` | `/vault/Logs/` | rw | .md (append-only) |

No new data is produced outside existing vault directories. Prompt hash is logged
via the existing AIOO log mechanism (writes to vault Logs/).

## Decomposition

| # | Subtask | Scope | Est | Notes |
|---|---------|-------|-----|-------|
| 1 | Create identity source files (SOUL.md, AIOO_IDENTITY.md, CLARK_IDENTITY.md, UNARES_IDENTITY.md) | full | 1h | Content from design session. All 4 files at vault root. UNARES_IDENTITY.md consumed by Unares spec. |
| 2 | Rename `brain-client.js` → `aioo-brain-client.js` + update all imports | full | 15min | `src/index.js` import, test files. |
| 3 | Implement `assemblePrompt()` in aioo-brain-client.js | full | 1h | Read 5 files, concatenate with section headers, compute SHA-256 hash. Fallback if files missing. |
| 4 | Add language config + injection | full | 30min | Add `"language"` field to both aioo config files. Language instruction appended after assembly. |
| 5 | Implement `debug-prompt` IPC handler | full | 45min | New message type in ipc-handler.js. Returns assembled prompt, hash, file status, language. Propagation: update Built/ipc-protocol.md with new types. |
| 6 | Add identity mounts to docker-compose.yml (AIOO) | full | 15min | 3 new `:ro` mounts per AIOO service (procenteo + inisio). |
| 7 | Add identity mounts to clark-handler.ts (Clark) | full | 30min | Mount SOUL.md and CLARK_IDENTITY.md in `buildClarkArgs()`. |
| 8 | Update Clark CLAUDE.md with @-imports | full | 15min | Replace inline role definition with @-imports of SOUL.md and CLARK_IDENTITY.md. |
| 9 | Write tests | full | 1.5h | Prompt assembly (order, hash, missing files, language). Debug-prompt IPC. Clark mount verification. |

Prior-layer dependencies (already built, no changes needed):
- IPC library (`lib/ipc/`) — prior-layer (built, Layer 0)
- AIOO daemon skeleton (`containers/aioo/src/index.js`) — prior-layer (built, Layer 2)
- IPC handler (`containers/aioo/src/ipc-handler.js`) — modified in subtask 5
- Clark handler (`services/nanoclaw-paw/src/paw/clark-handler.ts`) — modified in subtask 7

## Evaluation Design

### Unit Tests (aioo-brain-client)

| # | Test | Expected Result |
|---|------|----------------|
| T1 | `assemblePrompt()` with all 5 files present | Returns concatenated prompt with files in order: SOUL → IDENTITY → NORTHSTAR → GLOSSARY → CLAUDE. Hash is 64-char hex string. |
| T2 | `assemblePrompt()` with SOUL.md missing | Returns fallback minimal prompt. `files.SOUL` reports `"missing"`. Log contains error about missing SOUL.md. |
| T3 | `assemblePrompt()` with all files missing | Returns 3-line fallback prompt (current behavior). All files report `"missing"`. |
| T4 | Same files → same hash | Two calls with identical file content produce identical SHA-256 hash. |
| T5 | File change → hash change | Modify one file between calls → hash differs. |
| T6 | Language injection with `"language": "pl"` | Assembled prompt ends with `"Language: Communicate in Polish (pl). Code and logs always in English."` |
| T7 | Language injection with `"language": "en"` | Assembled prompt ends with `"Language: Communicate in English (en). Code and logs always in English."` |
| T8 | No language in config | No language line appended (backward-compatible with configs that predate this change). |

### Unit Tests (debug-prompt IPC)

| # | Test | Expected Result |
|---|------|----------------|
| T9 | Send `debug-prompt` message via IPC | Response type is `debug-prompt-response`. Payload contains `hash`, `prompt`, `files`, `language`, `assembledAt` fields. |
| T10 | Response `files` field lists all 5 file names with status | Each file key has value `"found"` or `"missing"`. |

### Integration Tests

| # | Test | Expected Result |
|---|------|----------------|
| T11 | `docker inspect aioo-procenteo` volumes | Shows 3 new `:ro` mounts: SOUL.md, AIOO_IDENTITY.md, CLAUDE.md at `/identity/` paths. |
| T12 | Clark container has identity files | After clark-handler spawn, `/vault/SOUL.md` and `/vault/CLARK_IDENTITY.md` exist inside container (read-only). |
| T13 | AIOO startup log includes prompt hash | `docker logs aioo-procenteo` contains line matching `prompt hash: sha256:[a-f0-9]{64}`. |

### Smoke Tests

| # | Test | Expected Result |
|---|------|----------------|
| T14 | Edit SOUL.md on host, restart AIOO | Prompt hash in startup log differs from previous startup. |
| T15 | Clark CLAUDE.md renders with identity | Claude Code inside Clark container sees SOUL.md and CLARK_IDENTITY.md content via @-imports. |

## References

- Decisions: `./identity-loading-decisions.md`
- AIOO spec: `../Built/aioo.md`
- AIOO decisions: `../Built/aioo-decisions.md`
- Clark spec: `../Built/clark.md`
- NanoClaw-PAW spec: `../Built/nanoclaw-paw.md`
- IPC protocol spec: `../Built/ipc-protocol.md`
- Architecture: `memory-vault/ARCHITECTURE.md`
- JTBD framework: `../jtbd-specification-engineering.md`
