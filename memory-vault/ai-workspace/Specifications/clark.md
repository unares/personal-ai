# Clark (Clarity Architect) — Specification

> Per-human philosophical brain. Air-gapped from AIOO.
> Date: 2026-03-11

## JTBD

"When I'm making decisions about my entity or the workspace, I want an
independent thinking partner that helps me see clearly, so I can make
better decisions without being influenced by the operational system's
momentum."

## The 5 Primitives

### 1. Problem Statement

Each human in Personal AI Workspace needs an independent thinking partner
that is completely separated from the operational system (AIOO). Clark
helps humans think clearly — asking questions, surfacing assumptions,
challenging decisions — without prescribing actions. The air-gap between
Clark and AIOO is critical: Clark must form independent opinions
uncontaminated by AIOO's operational state or decisions.

### 2. Acceptance Criteria

1. A human can message Clark on their dedicated channel and receive
   thoughtful responses within the context of their entity's distilled
   knowledge, without Clark having access to AIOO's current state.
2. Clark's container has zero network access to any AIOO container —
   verified by network isolation test from inside the container.
3. Clark can read Distilled/ vault content (read-only) to ground
   conversations in the entity's refined knowledge.

### 3. Constraint Architecture

**Must do:**
- Use vanilla NanoClaw (upstream, unmodified) for container lifecycle
- Separate messaging channel per human (clark-michal, clark-mateusz, clark-andras)
- Mount Distilled/ read-only (per human's entity access)

**Must not do:**
- Access AIOO containers (network, filesystem, or IPC)
- Write to vault (except own Logs/ if needed)
- Trigger stage transitions or modify task graphs
- Access Raw/ or Memories/ directories

**Preferences:**
- Ephemeral containers (spin up on message, die after idle)
- Keep Clark's .md stack minimal (identity + vault context, no operational tools)

**Escalation triggers:**
- Human requests information Clark can't access (AIOO state, operational metrics)
  → Clark should say "I don't have access to that — ask AIOO"

### 4. Decomposition

| Subtask | Description |
|---------|-------------|
| 1. Fork NanoClaw | Create PAW fork (shared with AIOO messaging) |
| 2. Clark identity | Write Clark's CLAUDE.md (containers/clark/CLAUDE.md) |
| 3. Vault mounts | Configure Distilled/ read-only per human's entity access |
| 4. Channel setup | Configure dedicated messaging channel per human |
| 5. Network isolation | Ensure no network route to AIOO containers |
| 6. Test air-gap | Verify isolation from inside Clark container |

### 5. Evaluation Design

| Test | Expected Result |
|------|-----------------|
| Message on clark-michal channel | Clark spawns, responds with context from Distilled/ |
| `docker exec clark-michal ping aioo-procenteo` | Connection refused / no route |
| `docker exec clark-michal ls /vault/` | Only Distilled/ visible |
| Clark asks about AIOO state | Clark responds "I don't have access to that" |
| 30-min idle | Clark container auto-removed |

## Per-Human Clark Instances

| Instance | Human | Vault Access (Distilled/ read-only) |
|----------|-------|-------------------------------------|
| clark-michal | Michal (ai-architect) | All entities |
| clark-mateusz | Mateusz (co-founder) | procenteo only |
| clark-andras | Andras (co-founder) | inisio only |

## References

- NanoClaw research: `../Research/nanoclaw-architecture-analysis.md`
- NanoClaw-PAW spec: `./nanoclaw-paw.md` (shared fork)
- Architecture: `memory-vault/ARCHITECTURE.md`
