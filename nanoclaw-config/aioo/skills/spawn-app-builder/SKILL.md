# Spawn App Builder — Isolated Build Environment

> Do One Thing. Earn Full Autonomy.

## Trigger
`/spawn-app-builder <app-name> [--repo <url>] [--brief <description>]`

## What It Does
Spawns an isolated App Builder container via NanoClaw's container-runner. Each App Builder:
- Gets its own workspace at `/workspace/`
- Has read-only access to entity context (Distilled/, NORTHSTAR.md)
- Runs Claude Code for actual building
- Lives on the `personal-ai-net` Docker network (can reach Context Extractor API)

## Usage
```
/spawn-app-builder my-dashboard
/spawn-app-builder landing-page --repo https://github.com/org/repo
/spawn-app-builder api-server --brief "REST API for task management with SQLite"
```

## Container Configuration
```
Image:    personal-ai-app-builder
Name:     app-builder-{app-name}-{entity}
Network:  personal-ai-net

Mounts:
  /vault/Distilled/  (ro)  — entity context
  /vault/NORTHSTAR.md (ro) — entity vision
  /workspace/         (rw) — app code (named volume)

Environment:
  ENTITY={entity}
  APP={app-name}
  GITHUB_TOKEN={from parent env, if set}
  ANTHROPIC_API_KEY={from parent env}
```

## Lifecycle
1. AIOO decides to build something based on northstar
2. AIOO runs `/spawn-app-builder <name> --brief <description>`
3. NanoClaw container-runner creates the container with above config
4. App Builder reads NORTHSTAR.md and brief, starts building
5. AIOO logs TASK_SPAWNED to Chronicle with container details
6. App Builder commits and pushes when done
7. Container stops after CONTAINER_TIMEOUT (default 30 min)

## Constraints
- Max 3 concurrent App Builders (MAX_CONCURRENT_CONTAINERS=3)
- Each builder gets its own isolated workspace volume
- Builders CANNOT spawn other containers (no Docker socket)
- Builders CANNOT write to /vault/ (read-only mounts)
- Builders CAN access Context Extractor API on personal-ai-net

## Chronicle Integration
On spawn, AIOO logs:
```json
{
  "type": "TASK_SPAWNED",
  "agent": "aioo",
  "container": "app-builder-{name}-{entity}",
  "brief": "description of what to build",
  "timestamp": "ISO-8601"
}
```

---

## Mission Alignment
Delegation is leverage. AIOO focuses on the One Thing while App Builders handle isolated build tasks. Each spawn is a deliberate decision logged to Chronicle — demonstrating the system can responsibly manage parallel execution.

## Scope
Defines the spawn-app-builder skill: container config, mounts, lifecycle, constraints. Does NOT define App Builder behavior (see app-builder/CLAUDE.md) or NanoClaw container-runner internals.

## Interfaces
- **Read by**: AIOO agent when spawning builders
- **Written by**: Human (system architect)
- **Depends on**: Docker socket, personal-ai-app-builder image, personal-ai-net network

## Outcomes
- Isolated, reproducible build environments
- Clear audit trail of what was spawned and why
- Resource limits prevent runaway container creation
- Read-only vault access prevents accidental data corruption

## Gamification Hooks
- [ ] Spawn success rate: % of spawns that complete without error → operational reliability
- [ ] Builder completion rate: % of spawned builders that ship working code → brief quality
- [ ] Brief clarity score: length and specificity of briefs provided → delegation skill
- [ ] Concurrent utilization: avg active builders / max → resource efficiency

## Document History
| Date | Change | Author |
|------|--------|--------|
| 2026-03-04 | v0.4: Initial spawn-app-builder skill | System |
