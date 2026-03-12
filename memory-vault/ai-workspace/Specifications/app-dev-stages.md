# App Dev Stages — Specification

> The 4-stage App Factory pipeline.
> Date: 2026-03-11

## JTBD

"When I have a validated idea and a team, I want a structured progression
from prototype to scaled product, so I can focus on the right work at
each phase without the chaos of fluid, overlapping development stages."

## The 4 Stages

```
┌────────────┐    ┌────────────┐    ┌────────────┐    ┌────────────┐
│ Stage 1    │───►│ Stage 2    │───►│ Stage 3    │───►│ Stage 4    │
│ DEMO       │    │ TESTING    │    │ LAUNCH     │    │ SCALING    │
│ (PoC)      │    │ (MVP)      │    │ (Product)  │    │ (Distrib.) │
└────────────┘    └────────────┘    └────────────┘    └────────────┘
```

### Stage 1: Demo (PoC)

| Aspect | Detail |
|--------|--------|
| Purpose | Validate core value proposition with a working prototype |
| Container | `{appname}-app-demo` |
| Environment | Rapid prototyping. Local-first. Minimal dependencies. |
| .md stack | Skills for scaffolding, quick iteration, throwaway code |
| Acceptance | App runs locally, 3 core user flows work, demo exists |
| JTBD | "When idea is validated, prototype to test value prop" |

### Stage 2: Testing (MVP)

| Aspect | Detail |
|--------|--------|
| Purpose | Deploy for real user testing with minimum viable features |
| Container | `{appname}-app-testing` |
| Environment | Fast deployment. e.g. Supabase + Vercel. Auth. Feedback. |
| .md stack | Skills for deployment, user management, analytics |
| Acceptance | Deployed, 5 test users can sign up and complete core flow |
| JTBD | "When PoC proves concept, deploy for real user testing" |

### Stage 3: Launch (Product v1.0)

| Aspect | Detail |
|--------|--------|
| Purpose | Production-ready product with reliability and polish |
| Container | `{appname}-app-launch` |
| Environment | Production stack. Monitoring. Error handling. Performance. |
| .md stack | Skills for production hardening, observability, CI/CD |
| Acceptance | [To be defined during Stage 2 learnings] |
| JTBD | "When MVP is validated, launch production-ready product" |

### Stage 4: Scaling (Distribution)

| Aspect | Detail |
|--------|--------|
| Purpose | Scale to reach target audience with growth mechanisms |
| Container | `{appname}-app-scaling` |
| Environment | Growth tools. Analytics. A/B testing. Marketing. |
| .md stack | Skills for growth, optimization, distribution channels |
| Acceptance | [To be defined during Stage 3 learnings] |
| JTBD | "When product is stable, scale to reach target audience" |

## Stage Transitions

```
AIOO monitors stage outcomes
     │
     ▼
Outcomes met? ──no──► Continue working
     │
    yes
     │
     ▼
AIOO → NanoClaw-PAW → Messaging → Human
"Stage 1 complete for procenteo. Ready for Stage 2?"
     │
     ▼
Human approves (micro-HITL or heavy-HITL depending on complexity)
     │
     ▼
Stage Lifecycle Script:
  docker compose --profile procenteo-app-testing up
  docker compose --profile procenteo-app-demo down
     │
     ▼
Human enters new container via participate.sh
Sets up outcomes for next stage (heavy-HITL)
     │
     ▼
AIOO takes over with Agent SDK subprocesses
```

## Concurrency Model

**Phase 1 (MacBook):** One App Dev Stage container per entity at a time.
Sequential progression. Clear separation.

**Future (VPS):** Configurable concurrency. Start with 2 concurrent stages
per entity, then 3+. Requires:
- AIOO managing multiple active task graphs
- Shared vault write coordination
- Docker Compose profiles supporting multiple active profiles
- No architectural blockers — the design supports this by using Compose
  profiles (multiple can be active) and per-container vault mounts.

## App Naming Convention

`{appname}-app-{stage}` where stage is: demo, testing, launch, scaling.

Entity names are permanent. App names are permanent within their entity.
First apps in procenteo and inisio share entity names. Future apps differ.

## Implementation: Compose Profiles

Each stage is a Compose profile. Profiles are declarative (defined in YAML)
but activated imperatively (script runs the right profile).

```yaml
# docker-compose.yml (conceptual)
services:
  procenteo-app-demo:
    profiles: ["procenteo-app-demo"]
    image: app-dev-stage:demo
    volumes:
      - ./memory-vault/procenteo:/vault
    # stage-specific config...

  procenteo-app-testing:
    profiles: ["procenteo-app-testing"]
    image: app-dev-stage:testing
    volumes:
      - ./memory-vault/procenteo:/vault
    # stage-specific config...
```

## References

- JTBD + Spec Engineering framework: `./jtbd-specification-engineering.md`
- Architecture: `memory-vault/ARCHITECTURE.md`
- Target narrative: `../Narratives/target-architecture-narrative.md`
