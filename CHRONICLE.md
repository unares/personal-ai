# Chronicle — Event System Spec

> Do One Thing. Earn Full Autonomy.

Chronicle is the accountability backbone of Personal AI. Every file change, every agent action, every routing decision is logged with a traceable job-ID chain. Accountability earns autonomy.

> v0.3: Basic event logging implemented in Context Extractor (chronicle.js).
> v0.4 goal: NanoClaw integration with Routing Trace logging and cross-agent tracing.

## Event Types

| Event | Trigger |
|-------|---------|
| `FILE_CREATED` | New file appears in any watched directory |
| `FILE_MODIFIED` | Existing file content changes |
| `FILE_MOVED` | File relocated within vault |
| `FILE_DELETED` | File removed or moved to Bin/ |
| `SESSION_START` | Agent container started (v0.4) |
| `SESSION_END` | Agent container stopped (v0.4) |
| `TASK_SPAWNED` | AIOO spawned a nested container (v0.4) |
| `SKILL_INVOKED` | NanoClaw skill was used (v0.4) |
| `ROUTING_DECISION` | Hybrid router chose LLM model (v0.4) |

## Job-ID System

Every processing action gets a unique job ID:

```
{agent}-{entity}-{timestamp}-{short-hash}
```

Example: `context-extractor-onething-20260304T1423-a3f2`

## Tracing Flow

```
Human drops note in Raw/
  → Context Extractor (FILE_CREATED) → job-id assigned
    → Processing/ (intermediate state)
      → Distilled/ (final output)
        → Chronicle logs full trace
```

Cross-agent tracing:
- Clark reads Distilled/ → logged with Clark's job-id referencing source job-id
- AIOO reads/writes vault → logged with AIOO's job-id
- App Builder reads Distilled/ → logged with App Builder's job-id

## Event Schema

```json
{
  "timestamp": "2026-03-04T14:23:00.000Z",
  "event_type": "FILE_CREATED",
  "entity": "onething",
  "path": "Raw/michal/Submissions/quarterly-review.md",
  "job_id": "context-extractor-onething-20260304T1423-a3f2",
  "agent": "context-extractor",
  "metadata": {
    "size_bytes": 2048,
    "source": "human-drop"
  }
}
```

## Current Implementation (v0.3)

- `context-extractor/chronicle.js` — emits FILE_CREATED events during processFile()
- Events persisted to `{entity}/Logs/chronicle.jsonl`
- Job-IDs generated with `{agent}-{entity}-{timestamp}-{hash}` pattern

## Cross-Agent Tracing Spec (v0.4)

### Overview

Every agent action that touches the vault gets a job-ID. When one agent's output
triggers another agent's input, the downstream job references the upstream job-ID
via `parent_job_id`. This creates a traceable chain across the entire system.

### Agent Event Responsibilities

| Agent | Emits | Triggered By |
|-------|-------|--------------|
| Context Extractor | FILE_CREATED (Distilled/), FILE_DELETED (Bin purge) | Raw/ file watcher |
| AIOO | FILE_CREATED, FILE_MODIFIED, TASK_SPAWNED, ROUTING_DECISION | Human instruction, WhatsApp, scheduled |
| Clark | SESSION_START, INSIGHT_LOGGED | Human conversation, WhatsApp |
| App Builder | SESSION_START, COMMIT_CREATED | AIOO spawn or human instruction |

### Linked Job-ID Chain Example

```
1. Human drops note → Raw/michal/Submissions/idea.md
   job: context-extractor-onething-20260304T1423-a3f2
   event: FILE_CREATED

2. Context Extractor distills → Distilled/Clark/idea-summary.md
   job: context-extractor-onething-20260304T1423-a3f2  (same job)
   event: FILE_CREATED

3. Clark reads Distilled/ in next session
   job: clark-onething-20260304T1600-b7c1
   parent_job_id: context-extractor-onething-20260304T1423-a3f2
   event: SESSION_START

4. AIOO acts on Clark's insight
   job: aioo-onething-20260304T1730-d4e9
   parent_job_id: clark-onething-20260304T1600-b7c1
   event: FILE_CREATED (Raw/AIOO/action-plan.md)
```

### Extended Event Schema (v0.4)

```json
{
  "timestamp": "2026-03-04T16:00:00.000Z",
  "event_type": "ROUTING_DECISION",
  "entity": "onething",
  "job_id": "aioo-onething-20260304T1600-b7c1",
  "agent": "aioo",
  "metadata": {
    "chosen_model": "gemini-3.1-pro",
    "reason": "Planning task — roadmap generation",
    "confidence": 92,
    "estimated_cost_savings": "65%",
    "escalation_trigger": null
  }
}
```

### Implementation Plan

1. **Context Extractor** (v0.3 — done): Emit events on file processing
2. **NanoClaw agents**: Emit SESSION_START on launch, reference last relevant job-ID
3. **Hybrid router**: Log ROUTING_DECISION with full Routing Trace metadata
4. **Launcher scripts**: Pass `--last-job-id` env var to containers on spawn
5. **Query API**: Add `/chronicle?entity=X&job_id=Y` to trace full job chain
6. **Retention**: Rotate chronicle.jsonl at 10MB, keep last 3 files

---

## Mission Alignment
Accountability earns autonomy. When every agent action is traced, logged, and auditable, the system builds a track record that justifies expanded trust and scope. Chronicle is the proof.

## Scope
Event logging, job-ID tracing, and audit trail. Does NOT define agent behavior (see agent CLAUDE.md files) or vault structure (see MEMORY_VAULT.md).

## Interfaces
- **Read by**: All agents (via Logs/), humans (via CLI or Mission Control dashboard)
- **Written by**: Context Extractor (chronicle.js), NanoClaw agents (via /chronicle-log skill)
- **Depends on**: Memory vault Logs/ directory, context-extractor/chronicle.js

## Outcomes
- Complete audit trail of every agent action
- Cross-agent job tracing via parent_job_id
- LLM routing accountability via Routing Trace events
- Foundation for autonomous escalation decisions

## Gamification Hooks
- [ ] Trace coverage: % of agent sessions with complete job-ID chains → completeness signal
- [ ] Routing accuracy: % of Routing Trace decisions confirmed correct by human review → earns routing autonomy
- [ ] Event volume: events per day per entity → activity signal
- [ ] Cost savings: cumulative $ saved via hybrid routing (from ROUTING_DECISION metadata) → efficiency score
- [ ] Chain depth: average parent_job_id chain length → collaboration complexity signal

## Document History
| Date | Change | Author |
|------|--------|--------|
| 2026-03-04 | v0.3: Initial spec with basic event logging | System |
| 2026-03-04 | v0.4: Added NanoClaw event types, Routing Trace schema, constitution pattern | System |
