# High-Level Architecture — Strategic Perspective

> This file provides strategic context for companion AIs serving as think
> partners. It describes what Personal AI Workspace is and how its key
> elements relate — without implementation details.

## What Personal AI Workspace Is

A containerized workspace where humans and companion AIs collaborate on
entity outcomes. Each entity (business venture, project, initiative) gets
its own vision, terminology, knowledge vault, and operational AI support.

## Entity Model

```
┌─────────────────────────────────────────┐
│         Personal AI Workspace            │
├──────────────┬──────────┬───────────────┤
│ ai-workspace │ procenteo│ inisio        │
│ (meta-entity)│ (app)    │ (app)         │
│ The system   │ Mateusz  │ Andras        │
│ itself       │ + Michal │ + Michal      │
└──────────────┴──────────┴───────────────┘
```

- **Meta-entity** (ai-workspace): The workspace itself. Used for evolving
  system infrastructure. Michal operates this.
- **App-factory entities** (procenteo, inisio): Ventures that use the system
  to build apps through 4 sequential stages (Demo → Testing → Launch → Scaling).

Each entity owns: NORTHSTAR (vision), GLOSSARY (terminology), vault (knowledge).

## The 3 Companion AI Roles

- **AIOO** (AI Operating Officer): One per app-factory entity. Manages tasks,
  stages, costs, and human communication. The operational brain that drives
  entity outcomes.

- **Clark** (Clarity Architect): One per human. Philosophical think partner
  that helps humans reason about their work, decisions, and direction. Sees
  only refined knowledge (Distilled/), deliberately isolated from operational
  noise.

- **Unares** (Workspace Observer): Single instance for Michal. System-wide
  visibility — can observe all entities, all components, all activity. The
  admin interface.

## App Dev Pipeline

Apps progress through 4 stages. Each stage has increasing infrastructure
maturity and decreasing experimentation tolerance:

```
Demo (PoC) → Testing (MVP) → Launch (Product) → Scaling (Distribution)
   fast          real             hardened           growth
   iterate       validate         ship               scale
```

Each stage runs in its own container with appropriate access and constraints.

## Key Metrics

- **HRoT** (Human Return on Time): The value humans get from each minute
  spent on the system. The system should maximize outcome per unit of human
  attention. Micro-HITL (<30s), Light-HITL (<10min), Heavy-HITL (10min+).

- **RoT** (Return on Tokens): LLM cost efficiency per entity. Every token
  spent should trace to a measurable outcome.

## Design Philosophy

- **JTBD** (Jobs To Be Done): Every component exists to serve a defined job.
  If the job isn't clear, the component isn't ready to build.
- **Specification Engineering**: Translates JTBD into agent-executable specs
  with 5 primitives: problem statement, acceptance criteria, constraints,
  decomposition, evaluation design.
- **Do One Thing. Earn Full Autonomy**: Agents start supervised and earn
  independence through demonstrated reliability.
