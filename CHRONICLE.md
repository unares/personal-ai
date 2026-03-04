# Chronicle — Event System Spec

> v0.3: Basic event logging implemented in Context Extractor (chronicle.js).
> v0.4 goal: Full chokidar-based watcher with cross-agent tracing.

## Purpose

Chronicle is the event backbone of Personal AI. It observes every file change
in the vault and emits structured events that agents can subscribe to.

## Event Types

| Event | Trigger |
|-------|---------|
| `FILE_CREATED` | New file appears in any watched directory |
| `FILE_MODIFIED` | Existing file content changes |
| `FILE_MOVED` | File relocated within vault |
| `FILE_DELETED` | File removed or moved to Bin/ |

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

## Cross-Agent Tracing Spec (v0.4+)

### Overview

Every agent action that touches the vault gets a job-ID. When one agent's output
triggers another agent's input, the downstream job references the upstream job-ID
via `parent_job_id`. This creates a traceable chain across the entire system.

### Agent Event Responsibilities

| Agent | Emits | Triggered By |
|-------|-------|--------------|
| Context Extractor | FILE_CREATED (Distilled/), FILE_DELETED (Bin purge) | Raw/ file watcher |
| AIOO | FILE_CREATED, FILE_MODIFIED (Raw/AIOO/, Distilled/AIOO/) | Human instruction or scheduled |
| Clark | SESSION_START, INSIGHT_LOGGED | Human conversation |
| App Builder | SESSION_START, COMMIT_CREATED | Human instruction |

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
  "event_type": "SESSION_START",
  "entity": "onething",
  "job_id": "clark-onething-20260304T1600-b7c1",
  "parent_job_id": "context-extractor-onething-20260304T1423-a3f2",
  "agent": "clark",
  "metadata": {
    "container": "clark-michal",
    "files_read": ["Distilled/Clark/idea-summary.md"]
  }
}
```

### Implementation Plan

1. **Context Extractor** (v0.3 — done): Emit events on file processing
2. **NanoClaw agents**: Emit SESSION_START on launch, reference last relevant job-ID
3. **Launcher scripts**: Pass `--last-job-id` env var to containers on spawn
4. **Query API**: Add `/chronicle?entity=X&job_id=Y` to trace full job chain
5. **Retention**: 90 days in chronicle.jsonl, then rotate to chronicle-archive/
