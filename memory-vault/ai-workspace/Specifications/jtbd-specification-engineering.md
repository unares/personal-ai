# JTBD + Specification Engineering — Layered Framework

> How Personal AI Workspace connects human intent to agent action.
> Date: 2026-03-11

## Core Principle: Layers, Not Merge

JTBD and Specification Engineering solve different problems at different altitudes.
Merging them would dilute both. Keeping them as layers creates an unbroken chain
from human intent to agent execution.

## The Three Layers

```
┌─ JTBD Layer (human-facing, stable) ──────────────────────────────────┐
│  "When [situation], I want to [motivation],                           │
│   so I can [expected outcome]."                                       │
│                                                                        │
│  Lives in: NORTHSTAR files, App Dev Stage definitions                 │
│  Owner: Human                                                         │
│  Changes: Rarely — the job is stable, solutions change                │
│  Language: Natural ("I want to...")                                    │
│  Granularity: One JTBD per App Dev Stage                              │
└───────────────────────────────────┬────────────────────────────────────┘
                                    ▼ derives
┌─ Specification Layer (agent-executable, structured) ──────────────────┐
│  The 5 Primitives:                                                     │
│  1. Self-contained problem statement                                   │
│  2. Acceptance criteria (3 sentences, independently verifiable)        │
│  3. Constraint architecture (must-do, must-not-do, preferences,       │
│     escalation triggers)                                               │
│  4. Decomposition (independently executable subtasks, <2h each)       │
│  5. Evaluation design (measurable tests with known-good outputs)      │
│                                                                        │
│  Lives in: Vault spec files (per component, per stage)                │
│  Owner: Human writes, agents execute against                          │
│  Changes: Per stage or per design iteration                           │
│  Language: Structured, precise, agent-readable                        │
│  Granularity: One or more specs per App Dev Stage                     │
└───────────────────────────────────┬────────────────────────────────────┘
                                    ▼ generates
┌─ Task Graph Layer (agent-executed, runtime) ──────────────────────────┐
│  Subtask 1: Scaffold project with {stack}              [2h max]       │
│  Subtask 2: Implement user flow A                      [2h max]       │
│  Subtask 3: Implement user flow B                      [2h max]       │
│  ...each with clear input/output boundaries                           │
│                                                                        │
│  Each subtask is JTBD-driven: clear outcome per feature,              │
│  closing the loop back to the JTBD layer.                             │
│                                                                        │
│  Lives in: AIOO's Task Graph Engine (runtime)                         │
│  Owner: AIOO generates from specs, agents execute                     │
│  Changes: Dynamically as work progresses                              │
└───────────────────────────────────────────────────────────────────────┘
```

## Why Layers, Not Merge

| Concern | JTBD | Specification Engineering |
|---------|------|--------------------------|
| Audience | Human (business thinking) | Agent (machine execution) |
| Language | Natural ("I want to...") | Structured (5 primitives) |
| Stability | Stable (the job doesn't change) | Changes per implementation |
| Granularity | One job per stage | Many specs per stage |
| Purpose | Define WHY and WHAT | Define HOW (agent-executable) |

The connection point: each App Dev Stage has exactly one JTBD (why this stage
exists) and one or more specs (how agents execute it). The JTBD anchors the
spec — if a spec drifts from the JTBD, it's wrong.

## Per-Stage Structure

```
App Dev Stage 1 (Demo/PoC)
├── JTBD: "When idea is validated, prototype to test value prop"
├── Spec: project-scaffold.spec.md
├── Spec: core-flows.spec.md
├── Spec: demo-recording.spec.md
└── Evaluation: can a user see the value in 60 seconds?

App Dev Stage 2 (Testing/MVP)
├── JTBD: "When PoC proves concept, deploy for real user testing"
├── Spec: deployment-setup.spec.md
├── Spec: user-auth.spec.md
├── Spec: feedback-collection.spec.md
└── Evaluation: can 5 test users complete the core flow?

App Dev Stage 3 (Launch/Product v1.0)
├── JTBD: "When MVP is validated, launch production-ready product"
├── Spec: [to be defined]
└── Evaluation: [to be defined]

App Dev Stage 4 (Scaling/Distribution)
├── JTBD: "When product is stable, scale to reach target audience"
├── Spec: [to be defined]
└── Evaluation: [to be defined]
```

## Closing the Loop: Task Graph ↔ JTBD

The Task Graph is also JTBD-driven. Each feature within a task graph has
a clear outcome connected back to the stage's JTBD:

```
Stage JTBD: "Prototype to test value prop"
     │
     ├── Feature JTBD: "User can see their dashboard in <2s"
     │   └── Task: implement dashboard component
     │
     ├── Feature JTBD: "User can complete core action in 3 clicks"
     │   └── Task: implement core flow
     │
     └── Feature JTBD: "Stakeholder can see the demo in 60 seconds"
         └── Task: record demo, create landing page
```

This ensures no task exists without a traceable purpose. If a task can't be
connected to a JTBD, it shouldn't be in the graph.

## How Specifications Relate to ARCHITECTURE.md

ARCHITECTURE.md stays as the structural overview (topology, connections,
data flow). Each component referenced in ARCHITECTURE.md gets its own
spec file in the vault with the 5 primitives. Specs are what agents
execute against; ARCHITECTURE.md is what humans read for orientation.

```
ARCHITECTURE.md (structural overview)
  └── references components
       └── each component has: Specifications/{component}.spec.md
            └── contains: 5 primitives (agent-executable)
                 └── derived from: JTBD (human-owned)
```
