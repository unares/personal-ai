# Chronicle — Event System Spec (v0.4 design)

> Not yet implemented. This document captures the design for the chokidar-based
> file watcher that will replace the current polling approach in Context Extractor.

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

## Implementation Notes (v0.4)

- Use chokidar (already a dependency in Context Extractor)
- Events persisted to `{entity}/Logs/chronicle.jsonl`
- Global event stream at `Logs/chronicle-global.jsonl`
- Retention: 90 days, then auto-archive
