# MD-Actions — Metadata System for .md Files

> Do One Thing. Earn Full Autonomy.

## Overview

MD-Actions defines how .md files in the vault declare actionable metadata via YAML frontmatter. This enables multi-purpose information flow: the same metadata serves gamification, audit, and inter-agent coordination.

## Frontmatter Schema

```yaml
---
status: draft | review | approved | archived
owner: aioo | clark | app-builder | human
created: 2026-03-04T10:00:00Z
updated: 2026-03-04T12:00:00Z
actions:
  - type: review
    assignee: clark
    due: 2026-03-05
  - type: approve
    assignee: human
tags: [northstar, strategy, quarterly]
priority: high | medium | low
entity: onething
---
```

## Action Types

| Action | Description | Who Can Execute |
|--------|-------------|----------------|
| `review` | Content needs review for accuracy/clarity | Clark, Human |
| `approve` | Reviewed content needs final approval | Human |
| `reject` | Content is rejected with feedback | Human, Clark |
| `escalate` | Issue needs human attention | Any agent |
| `archive` | Content should be moved to Bin/ | AIOO, Human |
| `distill` | Raw content needs distillation | Context Extractor |

## Chronicle Integration

When an action is completed, a Chronicle event is logged:

```json
{
  "event_type": "ACTION_COMPLETED",
  "entity": "onething",
  "agent": "clark",
  "metadata": {
    "file": "Distilled/Clark/weekly-review.md",
    "action": "review",
    "result": "approved",
    "duration_ms": 45000
  }
}
```

## Information Flow

```
.md frontmatter → Context Extractor reads metadata
                → Chronicle logs action events
                → Gamification Agent reads Chronicle + metadata
                → Agents read status to prioritize work
```

The same metadata serves multiple purposes without duplication:
- **Gamification**: action completion rate, review speed, escalation frequency
- **Audit**: who did what, when, with what result
- **Coordination**: agents check status before acting on a document

---

## Mission Alignment
Structured metadata in .md files creates a lightweight workflow system. Actions are explicit, trackable, and auditable. This transparency earns trust and autonomy — the system can demonstrate it handles work responsibly.

## Scope
Defines YAML frontmatter schema and action types for .md files. Does NOT define gamification scoring (future Gamification Agent) or Context Extractor parsing logic.

## Interfaces
- **Read by**: All agents (for status), Context Extractor (for metadata indexing), future Gamification Agent
- **Written by**: Human (system architect)
- **Depends on**: Chronicle (for event logging), vault .md files

## Outcomes
- Every .md file has explicit status and ownership
- Actions are trackable from creation to completion
- Multi-purpose metadata reduces duplication across systems

## Gamification Hooks
- [ ] Action completion rate: % of assigned actions completed on time → reliability score
- [ ] Review speed: avg time from review-assigned to review-completed → responsiveness
- [ ] Escalation frequency: rate of escalations per entity → system health signal
- [ ] Metadata coverage: % of vault .md files with valid frontmatter → organization score

## Document History
| Date | Change | Author |
|------|--------|--------|
| 2026-03-04 | v0.4: Initial MD-Actions metadata spec | System |
