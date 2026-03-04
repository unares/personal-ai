# AIOO App Builder Spawning

> Do One Thing. Earn Full Autonomy.

## Overview

App Builders are isolated build environments spawned by AIOO (or manually by humans). Each App Builder runs Claude Code in a dedicated container, focused on building one app.

## How AIOO Spawns App Builders

AIOO uses the `/spawn-app-builder` NanoClaw skill:

```
/spawn-app-builder my-dashboard --brief "Admin dashboard for task tracking"
/spawn-app-builder landing-page --repo https://github.com/org/repo
```

NanoClaw's container-runner creates the container with:
- Image: `personal-ai-app-builder`
- Network: `personal-ai-net`
- Mounts: Distilled/ (ro), NORTHSTAR.md (ro), /workspace/ (rw)
- Max concurrent: 3 (configurable via MAX_CONCURRENT_CONTAINERS)

## How Humans Spawn App Builders

Humans can use the manual launcher directly:

```bash
./app-builder/app-builder.sh <entity> <app-name>
```

This provides an interactive setup with GitHub repo and PAT configuration.

## Security Model

| Resource | App Builder Access |
|----------|-------------------|
| /vault/Distilled/ | Read-only |
| /vault/NORTHSTAR.md | Read-only |
| /workspace/ | Read-write |
| Docker socket | None |
| personal-ai-net | Connected (can reach Context Extractor API) |

## Alternative Agents

AIOO can install and spawn other agent types inside its container:
- **cagent**: Lightweight Claude agent for quick tasks
- **Anthropic ADK**: Anthropic's Agent Developer Kit for structured workflows
- **Custom agents**: Any Docker image with appropriate labels

These are future capabilities — current implementation supports App Builder only.

---

## Mission Alignment
Delegation enables focus. AIOO spawns builders for isolated tasks while maintaining oversight. Each spawn is a deliberate decision with a clear brief, logged to Chronicle. This demonstrates responsible resource management — the system can orchestrate parallel work.

## Scope
Describes the App Builder spawning workflow for both AIOO (automated) and humans (manual). Does NOT define App Builder behavior (see app-builder/CLAUDE.md) or NanoClaw container-runner internals.

## Interfaces
- **Read by**: Humans (understanding the system), AIOO (reference)
- **Written by**: Human (system architect)
- **Depends on**: app-builder/Dockerfile, spawn-app-builder skill, Docker

## Outcomes
- Clear documentation of both automated and manual spawning paths
- Security model is explicit and auditable
- Future agent types are anticipated without over-engineering

## Gamification Hooks
- [ ] Spawn success rate: % of spawns completing without error → operational reliability
- [ ] Builder completion rate: % of spawned builders that ship working code → brief quality
- [ ] Time to first commit: avg time from spawn to first git commit → onboarding speed
- [ ] Manual vs automated ratio: trend toward more AIOO-spawned builders → automation maturity

## Document History
| Date | Change | Author |
|------|--------|--------|
| 2026-03-04 | v0.4: Initial AIOO-App Builder spawning spec | System |
