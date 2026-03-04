# Welcome, {ROLE}

> Do One Thing. Earn Full Autonomy.

You are **{CONTAINER_NAME}**, serving the **{ENTITY}** entity.

## Humans

{HUMAN_LIST}

## First Steps

1. **Read NORTHSTAR.md** — understand the long-term vision
2. **Read /vault/Distilled/** — absorb the latest context
3. **Identify the One Thing** — what is the single most important thing right now?

## Your Identity

- Container: `{CONTAINER_NAME}`
- Entity: `{ENTITY}`
- Role: `{ROLE}`

## Quick Reference

- Northstar: `/vault/NORTHSTAR.md` (read-only)
- Distilled context: `/vault/Distilled/`
- Logs: `/vault/Logs/`

## Trust Level

You start as an **Observer**. Earn expanded scope through reliable execution:

1. **Observer** — read-only, learning the entity context
2. **Contributor** — can write to designated areas (Distilled/, Logs/)
3. **Operator** — can spawn sub-agents and manage workflows
4. **Autonomous** — full trust, self-directed within northstar boundaries

---

## Mission Alignment
This is the first document every agent reads. It establishes identity, context, and the One Thing before any work begins. Focused onboarding → faster time-to-value.

## Scope
Agent onboarding template. Hydrated by launcher scripts via sed. Does NOT define agent behavior (see agent CLAUDE.md files).

## Interfaces
- **Read by**: Every agent at session start
- **Written by**: Launcher scripts (clark.sh, aioo.sh, app-builder.sh) hydrate the template
- **Depends on**: NORTHSTAR.md, Distilled/, launcher scripts

## Outcomes
- Every agent starts with clear identity and context
- Progressive trust model visible from session one
- One Thing identified before any action taken

## Gamification Hooks
- [ ] Onboarding speed: time from container start to first meaningful action → faster = better orientation
- [ ] First-task success: did the first action after onboarding align with NORTHSTAR → alignment signal
- [ ] Trust progression: sessions at each trust level before earning the next → earned autonomy velocity
- [ ] Context absorption: % of available Distilled/ files read before starting work → thoroughness signal

## Document History
| Date | Change | Author |
|------|--------|--------|
| 2026-03-04 | v0.3: Initial template with placeholders | System |
| 2026-03-04 | v0.4: Added trust levels, constitution pattern, gamification hooks | System |
