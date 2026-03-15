# NanoClaw-PAW (Personal AI Workspace Edition) — Specification

> Targeted fork of NanoClaw for Personal AI Workspace messaging and security.
> Date: 2026-03-11
> Source: https://github.com/qwibitai/nanoclaw (MIT license)
> Research: ../Research/nanoclaw-architecture-analysis.md

## What NanoClaw-PAW Is

A targeted fork of NanoClaw that adds ONE capability: persistent container
routing. Everything else stays upstream. NanoClaw was designed for ephemeral
chat-bot containers. Personal AI Workspace needs it to also route messages
to always-running containers (AIOO).

```
NanoClaw (upstream)              NanoClaw-PAW (fork)
├── Ephemeral containers ✓       ├── Ephemeral containers ✓ (Clark)
├── Channel registry ✓           ├── Channel registry ✓
├── Credential proxy ✓           ├── Credential proxy ✓ (per-entity keys)
├── Mount security ✓             ├── Mount security ✓ (vault paths)
├── Filesystem IPC ✓             ├── Filesystem IPC ✓
├── Persistent containers ✗      ├── Persistent containers ✓ (AIOO)
└── Per-entity config ✗          └── Per-entity config ✓
```

## The 5 Primitives

### 1. Problem Statement

Personal AI Workspace needs a messaging gateway that routes human messages
to companion AI containers (Clark, AIOO) and handles credential/mount
security. NanoClaw provides ephemeral container messaging (spawn on message,
die on idle) but cannot route messages to persistent containers (always
running, managed by Docker Compose). A targeted fork adds persistent
container routing while preserving NanoClaw's messaging, credential proxy,
and mount security capabilities.

### 2. Acceptance Criteria

1. Messages from any configured channel (WhatsApp/Telegram/Discord) route
   to the correct container — Clark (ephemeral, spawned by NanoClaw-PAW)
   or AIOO (persistent, managed by Docker Compose) — without the sender
   needing to know the routing mechanism.
2. Credential proxy ensures no API key ever enters any container. Real keys
   exist only on the host process. Verification: `docker exec` into any
   container and inspect env/proc — no real keys found.
3. A human can verify the entire system's message routing by inspecting the
   IPC directories (`ls ipc/`) and SQLite state (`sqlite3 store/messages.db`).

### 3. Constraint Architecture

**Must do:**
- Maintain NanoClaw's upstream code structure so updates can be pulled
  with minimal conflict
- Support both ephemeral (Clark) and persistent (AIOO) container routing
- Use filesystem IPC for persistent container messaging (consistent with
  NanoClaw's existing IPC model)
- Configure per-entity credential proxy (different API keys per
  app-factory entity)

**Must not do:**
- Modify NanoClaw's core message/channel architecture
- Introduce direct container-to-container networking (all routing
  through host process)
- Mount Docker socket into any container
- Store credentials in container environment variables, files, or stdin

**Preferences:**
- Keep the fork diff as small as possible (target: <200 lines added)
- Prefer NanoClaw's existing patterns over new patterns
- Configuration via JSON files, not code changes

**Escalation triggers:**
- Upstream NanoClaw makes breaking changes that conflict with PAW additions
- Persistent routing requires more than filesystem IPC (latency issues)
- NanoClaw's SQLite single-writer becomes a bottleneck under multi-entity load

### 4. Decomposition

| Subtask | Description | Input | Output |
|---------|-------------|-------|--------|
| 1. Fork | Fork NanoClaw, establish `paw` branch | GitHub repo | PAW fork |
| 2. Persistent registry | Add registry for containers that are already running (Compose-managed). Router checks this before spawning. | NanoClaw router.ts | Extended router |
| 3. IPC for persistent | Extend IPC to write to persistent container IPC dirs (already-mounted volumes) instead of spawning | NanoClaw ipc.ts | Extended IPC |
| 4. Per-entity credentials | Configure credential proxy with per-entity API keys. Route based on channel → entity mapping. | credential-proxy.ts | Multi-key proxy |
| 5. Vault mount config | Configure mount security allowlist for memory-vault paths per entity | mount-security.ts | Vault-aware mounts |
| 6. Clark channel | Set up Clark routing: ephemeral spawn, Distilled/ read-only mount, air-gapped (no AIOO network) | NanoClaw config | Working Clark |
| 7. AIOO channel | Set up AIOO routing: persistent IPC, per-entity channel mapping | NanoClaw config + registry | Working AIOO messaging |

### 5. Evaluation Design

| Test | Method | Expected Result |
|------|--------|-----------------|
| Clark ephemeral | Send message on Clark channel | Container spawns, responds, dies after 30min idle |
| AIOO persistent | Send message on AIOO channel | Message appears in AIOO IPC directory within 2 seconds |
| Credential isolation | `docker exec` into any container, inspect env + /proc | No real API keys found |
| Mount security | From inside container, attempt to access .ssh, .env, .aws | Access denied |
| Air-gap | From inside Clark container, attempt to reach AIOO network | Connection refused |
| Upstream pull | `git pull upstream main` on PAW branch | Merges cleanly (no conflicts in core files) |

## Architecture Fit

```
┌─ NanoClaw-PAW (host process) ───────────────────────────────────────┐
│                                                                      │
│  Channel Registry                                                    │
│  ├── WhatsApp / Telegram / Discord (configured per entity)          │
│  │                                                                   │
│  Router                                                              │
│  ├── Check: is target a persistent container? → IPC to mounted dir  │
│  └── Otherwise: spawn ephemeral container (upstream behavior)        │
│                                                                      │
│  Credential Proxy (HTTP, per-entity)                                 │
│  ├── procenteo requests → inject procenteo API key                  │
│  └── inisio requests → inject inisio API key                        │
│                                                                      │
│  Mount Security                                                      │
│  ├── Allowlist: memory-vault/{entity}/Distilled/ (Clark, read-only) │
│  ├── Allowlist: memory-vault/{entity}/ (AIOO stage containers, r/w) │
│  └── Blocklist: .ssh, .env, .aws, credentials, private_key         │
│                                                                      │
│  State: SQLite (messages, sessions, routing, persistent registry)   │
└──────────────────────────────────────────────────────────────────────┘
```

## Handler Modules

NanoClaw-PAW is a single host process with four handler modules:

```
NanoClaw-PAW (host process)
├── Messaging handler      → WhatsApp/Telegram/Discord routing
├── Agent spawn handler    → Agent SDK agents in stage containers
├── Clark handler          → Ephemeral companion container lifecycle (Clark)
├── Unares handler         → Ephemeral companion container lifecycle (Unares)
└── Stage handler          → Docker Compose profile transitions
```

The Stage handler receives `stage-signal` IPC from AIOO, executes
Docker Compose profile transitions (up new, health check, down old),
and returns `stage-ack`. Full spec: `./stage-lifecycle.md`

## What NanoClaw-PAW Does NOT Do

- Does not decide stage transitions (AIOO decides, human approves)
- Does not run task graphs or orchestrate agent work (AIOO does)
- Does not replace Docker Compose for infrastructure (complementary)

NanoClaw-PAW is the messaging, security, and execution layer. It routes
messages, spawns agents, and executes stage transitions — but never
decides what to do. AIOO is the brain, NanoClaw-PAW is the hands.

## Cherry-Picked Patterns (from upstream NanoClaw)

| Pattern | Source File | How We Use It |
|---------|-------------|---------------|
| Container spawn + mount construction | `container-runner.ts` | Clark ephemeral containers |
| Credential proxy | `credential-proxy.ts` | Per-entity API key isolation |
| Mount security (allowlist + blocklist) | `mount-security.ts` | Vault mount validation |
| Filesystem IPC protocol | `ipc.ts` | AIOO ↔ NanoClaw-PAW messaging bridge |
| Agent SDK integration | `agent-runner/src/index.ts` | Clark's Agent SDK usage |
| Channel registry | `channels/registry.ts` | WhatsApp/Telegram/Discord routing |
| GroupQueue concurrency | `group-queue.ts` | Clark container concurrency limits |
