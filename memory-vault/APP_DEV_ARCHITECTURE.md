# App Dev Architecture — Stage Perspective

> This file provides architectural context for agents and humans working
> inside App Dev Stage containers. It describes your environment, what you
> can access, and where you sit in the development lifecycle.

## Where You Are

You are inside an App Dev Stage container. Your stage and entity are set
by your environment (CLAUDE.md or env vars).

- **Vault**: mounted read-only at `/vault` — knowledge, .md files only
- **Workspace**: mounted read-write at `/workspace` — your code lives here
- **Separation**: vault = knowledge (.md only), workspace = code (any file type).
  Never write code to vault. Never store knowledge outside vault.

## The App Dev Lifecycle

Software progresses through 4 sequential stages. Each stage has a distinct
purpose, default infrastructure, and graduation criteria.

### Demo (PoC)
- **Purpose**: Validate the idea works. Fast iteration, minimal infrastructure.
- **Default stack**: Localhost-first. Minimal dependencies. Focus on core
  functionality, not production readiness.
- **Graduation**: Working demonstration of the core value proposition.
  Stakeholder agreement to invest in MVP.

### Testing (MVP)
- **Purpose**: Validate with real users. Real infrastructure, real data flows.
- **Default stack**: Supabase (database + auth), Vercel (hosting + deployment).
  Production-grade foundations with managed services.
- **Graduation**: User validation complete. Product decisions made. Ready for
  production hardening.

### Launch (Product)
- **Purpose**: Production readiness. Performance, security, reliability.
- **Default stack**: TBD — decided during stage activation.
- **Graduation**: Production launch complete. Growth systems needed.

### Scaling (Distribution)
- **Purpose**: Growth systems. Analytics, optimization, multi-market.
- **Default stack**: TBD — decided during stage activation.
- **Graduation**: Sustainable growth achieved.

## Adjacent Stage Awareness

Your software should be built not only for current-stage outcomes but ready
for the next stage's infrastructure defaults:

- Demo code should be structured for easy migration to Supabase + Vercel
- Testing code should be production-ready in architecture, not just function
- Each stage builds on the previous — don't rewrite, evolve

These defaults are system-wide — standardized across all apps built in
Personal AI Workspace. They get refined with each app dev cycle.

## Communication with AIOO

AIOO manages your entity's operations. As an agent in a stage container,
you receive task context from AIOO via the spawn command. You signal
completion by writing results to the workspace and exiting. AIOO monitors
task completion via NanoClaw-PAW.

## Heavy-HITL Pattern

When AIOO determines human intervention is needed:
1. AIOO messages the human via Telegram with context and a suggested prompt
2. Human opens Claude Code CLI terminal inside this container
3. Human pastes the prompt, works with Claude Code, resolves the issue
4. Human exits — AIOO picks up from the workspace state

The architecture file you're reading is the same one the human sees when
they enter this container. You share the same perspective.

## Key Metrics

- **RoT** (Return on Tokens): LLM cost efficiency. Be token-aware — prefer
  deterministic solutions over LLM calls where possible.
- **HRoT** (Human Return on Time): Minimize human intervention time.
  When requesting HITL, provide maximum context so the human can act fast.
