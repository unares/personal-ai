# Dev Update Specification v1.0

> Schema and pipeline specification for automated development updates from Claude Code instances to the vault. This document defines the contract between Claude Code agents and Context Extractor.

## Metadata

```yaml
spec_type: dev-update-pipeline
version: "1.0"
entity: onething
scope: all Personal AI features
schema: memory-vault/schemas/dev-update-v1.schema.json
```

---

## Overview

Every Claude Code instance (AIOO, Clark, App Builder, host dev) must write structured development updates to the vault. These updates capture distilled insights — what was built, why it matters, architectural decisions, and human working patterns — so Context Extractor can classify and route them into the semantic layer.

### Pipeline Flow

```
Claude Code session
  → dev-update --section "Header" "Content"  (accumulate)
  → dev-update --flush                        (assemble + write)
  → Raw/{entity}/{role}/dev-update-{date}-{hash}.md
  → Context Extractor watches Raw/
  → parseSections() splits by ## headers
  → classifySections() routes each section
  → Distilled/specification/     (technical content)
  → Distilled/shared-story/      (business decisions, team context)
  → Distilled/personal-story/    (human insights, working patterns)
```

## YAML Frontmatter Schema

Every dev update must have YAML frontmatter conforming to `dev-update-v1.schema.json`:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | string | Yes | Always `"dev-update"` |
| `version` | string | Yes | Schema version: `"1.0"` |
| `session_id` | string | Yes | Unique ID: `{role}-{entity}-{YYYYMMDD}-{hex6}` |
| `agent_role` | enum | Yes | `clark`, `aioo`, `app-builder`, or `host-dev` |
| `agent_label` | string | No | Human-readable role name |
| `entity` | string | Yes | Target entity from config.json |
| `human` | string | No | Owner or collaborator name |
| `app` | string/null | No | App name (for app-builder only) |
| `branch` | string | No | Active git branch |
| `timestamp` | datetime | Yes | ISO 8601 flush timestamp |

## Section Routing Table

Each `##` section header maps to a Context Extractor category:

| Section Header | Routes To | Pattern Triggers |
|---------------|-----------|------------------|
| `## What Was Built` | specification | implement, deploy, architecture, pipeline, function, class, container |
| `## Why It Matters` | shared-story | direction change, launch, customer, go-to-market, brand |
| `## Decisions Made` | specification + shared-story | architecture + we decided, the team, together |
| `## Human Patterns Observed` | personal-story | working style, identity, growth edge + human name patterns |
| `## Current State` | specification | must, constraint, deploy, test case, blocked |

All sections are optional. Agents include only sections relevant to the session.

## Traceability

The `session_id` field enables full traceability:

1. **Dev update file** → `session_id` in YAML frontmatter
2. **Distilled output** → `session_id` preserved in section content (frontmatter is part of preamble section)
3. **Chronicle log** → `DEV_UPDATE` event with matching `session_id` in `Logs/context-extractor.log`
4. **Session log** → `sessions.jsonl` has container/role info for the same timeframe

Query example: to find all work from a specific session:
```bash
grep "aioo-onething-20260306-a3f1c2" /vault/onething/Logs/context-extractor.log
```

## Role-Specific Guidelines

### AIOO (AI Operating Officer)
- Write after: significant milestones, feature completions, architecture decisions
- Focus sections: What Was Built, Decisions Made, Current State
- Entity: the entity AIOO operates for

### Clark (Clarity Architect)
- Write after: strategic insights surfaced, cross-entity pattern recognition
- Focus sections: Why It Matters, Human Patterns Observed
- Entity: the entity being discussed (may span multiple)

### App Builder
- Write after: each feature/fix completion, before session end
- Focus sections: What Was Built, Current State
- Entity: the entity the app serves
- Include `app` field in frontmatter

### Host Dev (Michal)
- Write after: development sessions, when insights emerge
- Focus sections: any/all as relevant
- Use `ROLE=host-dev` with `dev-update` script

## Example: AIOO Dev Update

```markdown
---
type: dev-update
version: "1.0"
session_id: aioo-onething-20260306-a3f1c2
agent_role: aioo
agent_label: "AI Operating Officer"
entity: onething
human: michal
branch: "fix/operational-hardening"
timestamp: "2026-03-06T10:30:00Z"
---

## What Was Built

Implemented section-level routing in Context Extractor. Files dropped into Raw/ are now
parsed into ## sections, each classified independently. Different categories receive
different content — specification gets technical sections, personal-story gets human
insights. Multi-entity routing detects mentions of inisio/procenteo and writes relevant
sections to those entity vaults too.

## Decisions Made

Chose section-level classification over whole-file classification. Trade-off: slightly
more complex processing, but eliminates the identical-output bug where every category
got the same content. The 1500-char truncation was moved to DB bodyPreview only —
distilled files on disk have full content.

## Current State

Context Extractor v0.4 processes the 239-line session log correctly:
- onething: 11 personal-story, 11 shared-story, 10 specification sections
- inisio: 3 personal-story + 1 specification (detected "andras" mentions)
- procenteo: 4 personal-story + 2 specification (detected "mateusz" mentions)

Retention policy: Raw files stay 60 days (marked with .distilled.json sidecar),
then move to Bin. Nothing is ever auto-deleted.
```

## Delivery Mechanism

The `dev-update` shell script is baked into all Docker images at `/usr/local/bin/dev-update`.

```bash
# Accumulate sections during session
dev-update --section "What Was Built" "Implemented feature X..."
dev-update --section "Decisions Made" "Chose approach A because..."

# Flush at session end or milestone
dev-update --flush
```

The script:
1. Reads ENTITY, ROLE, VAULT_PATH from environment
2. Accumulates sections in `/tmp/.dev-update-{PID}`
3. On flush: generates session_id, assembles YAML frontmatter + body
4. Tries Context Extractor `/ingest` API first (POST with subfolder)
5. Falls back to direct write to `/vault/{entity}/Raw/{role}/`
6. Logs DEV_UPDATE event to chronicle

---

## Mission Alignment

Dev updates feed the semantic layer continuously. Instead of wasting tokens digging through detailed dev logs after the fact, agents get pre-distilled insights automatically. The human's working patterns, architectural decisions, and project state flow through Context Extractor into exactly the categories where they're needed.

## Scope

Defines the dev-update schema, routing, and pipeline. Does NOT define Context Extractor internals (see classifier.js, simple.js) or agent role definitions (see role CLAUDE.md files).

## Interfaces

- **Written by**: All Claude Code instances via `dev-update` script
- **Read by**: Context Extractor (automatic processing)
- **Consumed by**: All agents via Distilled/ vault context
- **Depends on**: Context Extractor pipeline, vault Raw/ watcher

## Document History

| Date | Change | Author |
|------|--------|--------|
| 2026-03-06 | v1.0: Initial dev-update specification | System |
