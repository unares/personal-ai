# Architecture Design — Pattern Reference

> Practitioner-verified patterns for AI-era systems architecture.
> Calibrated for solo AI founders on VPS + Docker.
> All tool/framework references are examples (e.g.), not defaults. Docker is the only definite choice.
> Research: memory-vault/ai-workspace/Claude/Research/architecture-research-practitioner-signal.md

## Tier 1: Build Now

High consensus. Immediate Return on Tokens. Docker-native.

### 1. Durable Execution (88% practitioner agreement)

Persist execution state so agents survive crashes without re-burning tokens.

- Solo impl: append-only events table (e.g. Postgres event sourcing, SQLite WAL)
- Upgrade path: e.g. Temporal, DBOS, Hatchet when ops burden justifies
- Lock-in: LOW (standard SQL, portable anywhere)
- Key insight: checkpointing tells you where you were; durable execution guarantees
  you continue from there, exactly once, without intervention

### 2. Hybrid Memory (80% practitioner agreement)

Relational + vector + JSON in one database. Zero sync tax.

- Solo impl: e.g. Postgres + pgvector (one container, ACID, familiar tooling)
- Alternative: SQLite + Litestream for read-heavy workloads, with e.g. pgsqlite as bridge
- Lock-in: LOW (standard Postgres, pgvector is extension not fork)
- Key insight: the "just use a vector database" default from 2023-2024 is being replaced
  by hybrid approaches. SQL is making a serious comeback for agent memory.
- Watch: practitioners debating SQL vs vectors vs graphs — no single winner yet.
  Composite storage with value-based retention policies is the emerging consensus.

### 3. Schema-Gated Execution (78% practitioner agreement)

Validate every tool call against a schema before execution. Prevents 30-50% of wasted token spend.

- Solo impl: e.g. JSON Schema, Pydantic validation gates
- Lock-in: LOW (industry standards, works with any LLM provider)
- Key insight: conversation is unconstrained, execution is deterministic.
  LLMs handle intent translation (where they excel), schemas handle
  execution validation (where determinism is non-negotiable).

### 4. Stateless Agent as Pure Reducer (~85% practitioner agreement)

Agent = f(state + events) -> actions. No internal mutable state between invocations.

- Solo impl: raw SDKs (e.g. Anthropic, OpenAI) + thin wrappers
- Lock-in: LOW (most portable approach)
- Key insight: when an agent is stateless, its behavior is determined entirely
  by its inputs. This enables trivial pause/resume, easy parallelization,
  deterministic testing, and clean HITL integration (human approval = just
  another event in the log).
- Warning: LangChain accounts for 12.35% of all technical debt in LLM projects.
  Senior practitioners are moving to raw APIs. Anthropic's own docs agree.

### 5. Observability from Day One (elevated from implicit — 3 independent regret patterns)

Trace every LLM call, tool invocation, and response. Replay any run by ID.

- Solo impl: self-hosted (e.g. Langfuse — MIT, free; Helicone)
- Lock-in: LOW (standard trace formats, self-hosted)
- Key insight: three of the top practitioner regrets (no testing, no debugging,
  deploy-and-forget) all point to the same root cause: you can't improve what
  you can't see. Set up in hours, not days.

## Tier 2: Design In, Implement Incrementally

High value. Start simple, layer up.

### 6. Persistent Session Management (77% practitioner agreement)

Stateful agent sessions across container spin-ups without full re-initialization.

- Solo impl: own session table in Postgres or Redis
- Lock-in: LOW (plain SQL or standard Redis protocol)
- Key insight: treating AI response streams as durable, resumable sessions
  decouples agent execution lifecycle from client connection lifecycle.

### 7. Machine-First Interface Design (~75% practitioner agreement)

Design APIs and CLIs with AI agents as the primary consumer.

- Solo impl: --json flags, structured errors with recovery hints, short IDs,
  idempotent commands, aggregated context APIs (one call instead of five)
- Lock-in: LOW (HTTP/JSON is universal)
- Key insight: most infrastructure was built for human operators. Agents pay per
  token for output, can't read documentation, and are poor at recovering from
  ambiguous errors. Dual-mode output (human-readable + structured) is the minimum.

### 8. Container-Level Trust Boundaries (77% practitioner agreement)

Agent harness and generated code run in different containers with different trust levels.

- Solo impl: Docker network isolation + secret mounts (never env vars for secrets)
- Graduate: Docker -> e.g. gVisor (10-30% I/O overhead) -> e.g. Firecracker
  microVMs (125ms boot, <5MiB overhead) as threat model grows
- Lock-in: LOW (Docker is OCI standard)
- Critical: never mount host Docker socket into agent containers

### 9. Minimalist Framework Stance (67% practitioner agreement)

Frameworks are a bet, not a default. Evaluate critically.

- Solo impl: raw SDKs first. Evaluate orchestrators (e.g. LangGraph, n8n)
  for orchestration ONLY, not for tool wrappers or agent logic
- Lock-in: VARIES (raw SDKs = LOW; frameworks = MEDIUM to HIGH)
- Key insight: the anti-framework consensus is strong but not unanimous (67%).
  Some orchestrators have legitimate production use. The rule: if you can't
  debug it by reading the prompt, it's too much abstraction.

## Tier 3: Defer Behind Clean Interfaces

Real patterns, wrong scale for now. Abstract now, implement when needed.

### 10. Agent Protocol Layering (71% practitioner agreement)

Tool protocols (e.g. MCP) and agent protocols (e.g. A2A) are different layers.

- Solo impl: HTTP/JSON between containers now. MCP for tool interfaces when ready.
  A2A for agent-to-agent when stable.
- Lock-in: LOW (HTTP is forever, MCP is Linux Foundation, A2A is open)
- Key insight: MCP + A2A are complementary (tools + agents), not competing.
  Protocol wars are fluid — use pluggable interfaces so standards drop in later.

### 11. Error Cascade Governance (70% practitioner agreement)

One hallucination at step 1 compounds through the pipeline.

- Solo impl: structured logging + exponential backoff now. Full provenance
  tracking when agent count exceeds ~10.
- Lock-in: LOW (standard logging, no vendor dependency)
- Key insight: each agent validates its own reasoning but not the provenance
  of its inputs. Governance layer sits between agents and tracks what generated
  what — without changing individual agent behavior.

---

## Anti-Patterns

From practitioner regret research. The skill actively warns when these patterns emerge.

### 1. PoC-to-Production Trap
Polishing the prototype instead of redesigning for production.
After PoC validates the idea, redesign from scratch. The PoC taught you what you need.

### 2. Multi-Agent Overuse
Seven agents for three actions. Each step compounds failure risk.
Decision framework: Can this be a single LLM call? A deterministic workflow?
Add agents only where genuine flexibility is required.

### 3. Hosting Cost vs Business Cost
Saving $2K/year on hosting while spending 8-12 hrs/week on ops.
Calculate when your ops time exceeds hosting savings. Separate DB, cache,
and workers from day one — even on bare metal.

### 4. Deploy-and-Forget Mindset
Treating AI agents like traditional microservices. Deploy and done.
AI requires continuous evaluation, prompt versioning, and regression testing
as operational requirements — not nice-to-haves.

### 5. Docker Socket Mounting
Giving agent containers access to the host Docker daemon.
Never mount host Docker socket into agent containers. Use Docker-in-Docker or API.

---

## Scale Transitions

### Phase 1: Single VPS (current default)
- 0-10 agents, $5-50/mo
- Docker Compose, everything co-located, manual deploys
- Trigger to Phase 2: DB write contention, single point of failure pain,
  or ops time exceeding hosting cost savings

### Phase 2: Service Separation
- 10-50 agents, $100-500/mo
- Split DB to managed or separate VPS first, then cache/queue, then workers
- Deployment: e.g. Coolify, Dokku, Haloy for PaaS-like experience
- Trigger to Phase 3: multi-team, GPU scheduling, or app containers
  moving to own VPS

### Phase 3: Multi-Node
- 50+ agents, cost varies
- App containers become standalone deployments on own VPS
- Orchestration: e.g. Docker Swarm -> Nomad -> K8s only if needed
- Key insight: "By the time you outgrow Docker Swarm, you'll know whether K8s
  is the right next step"
- Warning: 83% of cloud migrations fail or exceed budget. Gradual migration
  (1% -> 100% traffic shift) not big-bang.

---

## Lock-In Risk Map

| Pattern | Low Lock-In | Medium Lock-In | High Lock-In |
|---------|------------|----------------|--------------|
| 1. Durable Execution | Postgres event sourcing | e.g. Temporal (workflow defs) | Custom retry spaghetti (maintenance) |
| 2. Hybrid Memory | Postgres + pgvector | e.g. Supabase (RLS coupling) | e.g. Pinecone (proprietary) |
| 3. Schema-Gated | JSON Schema / Pydantic | — | Framework-specific schemas |
| 4. Agent Reducer | Raw SDKs | e.g. LangGraph (graph defs) | e.g. LangChain (12.35% tech debt) |
| 5. Observability | e.g. Langfuse (MIT) | — | e.g. LangSmith (proprietary traces) |
| 6. Sessions | Postgres / Redis | — | Framework memory classes |
| 7. Interfaces | HTTP/JSON, MCP | GraphQL | Proprietary agent APIs |
| 8. Trust Boundaries | Docker containers | e.g. Firecracker (custom orch) | — |
| 9. Frameworks | Raw SDKs | e.g. n8n (workflow format) | e.g. LangChain ecosystem |
| 10. Protocols | HTTP/JSON + MCP | e.g. A2A (early) | Proprietary agent protocols |
| 11. Error Governance | Structured logging | — | Custom pipelines (effort) |

---

## Emerging Tools (1-2 year horizon)

### Adopt Now (production-ready)
- pgvector + pgvectorscale: vector search inside Postgres, competitive at 50M+ vectors
- Langfuse: self-hosted LLM observability, MIT license
- Coolify: self-hosted PaaS, Docker Compose native
- MCP: 97M+ monthly SDK downloads, Linux Foundation
- Litestream: zero-ops SQLite replication to S3

### Evaluate in 6-12 Months
- Firecracker microVMs: 125ms boot, <5MiB overhead, strong agent isolation
- gVisor: user-space kernel sandboxing, OCI-compatible
- A2A Protocol: agent-to-agent communication, Google + 100 enterprises
- Durable Streams (ElectricSQL): resumable token streaming
- pgsqlite: Postgres wire protocol on SQLite (start SQLite, swap to Postgres)

### Watch (18-24 Months)
- NIST AI Agent Standards: federal interoperability standards (Feb 2026)
- WebMCP (Chrome 146): browser-native MCP support
- Nomad: lightweight orchestration, 35MB binary, growing as K8s fatigue increases
