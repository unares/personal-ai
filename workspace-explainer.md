# Workspace & Container Architecture

> Do One Thing. Earn Full Autonomy.

How Personal AI isolates agents via Docker containers and volume mounts.

## What is `/workspace`?

It's a directory **inside a Docker container**. Think of a container like a sealed room — it has its own filesystem, its own processes, and by default can't see anything outside itself. `/workspace` is just the working folder inside that room.

```
Your computer (the host)
│
├── ~/personal-ai/              ← your actual files on disk
│   ├── memory-vault/
│   ├── setup/install.sh
│   ├── clark/clark.sh
│   └── ...
│
└── Docker containers (sealed rooms)
    ├── app-onething-plusone/
    │   └── /workspace/         ← THIS container's workspace
    │       ├── CLAUDE.md
    │       ├── NORTHSTAR.md
    │       └── ... (app code)
    ├── clark-michal/
    │   └── /vault/             ← clark uses /vault, not /workspace
    └── aioo-onething/
        └── /vault/
```

## Access Matrix

```
┌───────────────────────────────────────────────────────────────────────────────────┐
│ Component          │ /workspace │ /vault (Distilled) │ /vault (Raw) │ Docker Socket │
├───────────────────────────────────────────────────────────────────────────────────┤
│ App Builder        │ OWNS IT    │ read-only           │ no           │ no            │
│ Clark              │ no         │ read-only            │ no           │ no            │
│ AIOO               │ NanoClaw   │ read-write           │ full         │ yes (restricted) │
│ Context Extractor  │ no         │ writes to it         │ reads it     │ no            │
│ LiteLLM Proxy      │ no         │ no                   │ no           │ no            │
└───────────────────────────────────────────────────────────────────────────────────┘
```

All containers connect to `personal-ai-net` Docker network for inter-service communication.

## Why Each One Has What It Has

**App Builder** gets `/workspace` exclusively because it's building software. It needs read+write access to its own code, but only read-only access to the entity's distilled context (so it understands what it's building for, but can't corrupt the vault).

**Clark** (Clarity Architect) is the most restricted — read-only on distilled context only. It advises, never writes.

**AIOO** (AI Operating Officer) can write to the vault because it's responsible for distilling and organizing knowledge. It's the vault's steward. It also has restricted Docker socket access for spawning App Builder containers.

**Context Extractor** reads Raw notes and writes Distilled output. It never touches `/workspace` — it doesn't know or care about the app code.

**LiteLLM Proxy** has no vault or workspace access. It's a pure API proxy for LLM routing.

## The Key Mental Model

| Space | Analogy |
|---|---|
| `/workspace` | A builder's private workshop — only they have the key |
| `/vault/Distilled` | The shared library — most people can read, few can write |
| `/vault/Raw` | The inbox — only the archivist (Context Extractor) touches it |
| Docker Socket | The factory floor key — only the foreman (AIOO) carries it |

Containers can only see what was explicitly handed to them via `-v` (volume mount) when they were started. No volume mount = completely invisible. That's the security model.

---

## Mission Alignment
Container isolation enables focused execution. Each agent sees only what it needs — no distractions, no accidental corruption, no scope creep. Isolation is how agents earn trust: they can't break what they can't reach.

## Scope
Explains Docker container isolation and volume mount architecture. Does NOT define vault structure (see MEMORY_VAULT.md) or agent behavior (see agent CLAUDE.md files).

## Interfaces
- **Read by**: Humans (understanding the system), agents (understanding their boundaries)
- **Written by**: Human (system architect)
- **Depends on**: Docker Compose config, launcher scripts (which create the mounts)

## Outcomes
- Every stakeholder understands what each agent can and cannot access
- Security model is transparent and auditable
- New agents can be scoped correctly by following the matrix

## Gamification Hooks
- [ ] Mount correctness: do actual container mounts match this spec → compliance score
- [ ] Isolation integrity: zero unauthorized cross-container access events → security streak
- [ ] Scope minimization: agents using minimum required access → least-privilege score

## Document History
| Date | Change | Author |
|------|--------|--------|
| 2026-03-04 | v0.3: Initial container architecture explainer | System |
| 2026-03-04 | v0.4: Added AIOO Docker socket, LiteLLM, network, constitution pattern | System |
