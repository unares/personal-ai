# chronicle-log

Log an event to the entity's Chronicle audit trail.

## Usage

```
/chronicle-log <event-type> <description> [--metadata <json>]
```

## What This Does

Appends a structured JSONL event to /vault/Logs/chronicle.jsonl with timestamp, job-ID, agent name, and metadata. Used for accountability tracking and cross-agent tracing.

## Implementation

```bash
ENTITY="${ENTITY:-onething}"
EVENT_TYPE="$1"
DESCRIPTION="$2"
METADATA="${3:-{}}"
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")
AGENT="${ASSISTANT_NAME:-unknown}"
HASH=$(head -c 4 /dev/urandom | od -An -tx1 | tr -d ' ')
JOB_ID="${AGENT}-${ENTITY}-$(date -u +%Y%m%dT%H%M)-${HASH}"

LOG_DIR="/vault/${ENTITY}/Logs"
mkdir -p "$LOG_DIR"

echo "{\"timestamp\":\"${TIMESTAMP}\",\"event_type\":\"${EVENT_TYPE}\",\"entity\":\"${ENTITY}\",\"job_id\":\"${JOB_ID}\",\"agent\":\"${AGENT}\",\"metadata\":{\"description\":\"${DESCRIPTION}\",\"extra\":${METADATA}}}" >> "${LOG_DIR}/chronicle.jsonl"
```

## Event Types

- `SESSION_START` — agent session began
- `SESSION_END` — agent session ended
- `TASK_SPAWNED` — nested container created
- `SKILL_INVOKED` — a skill was used
- `ROUTING_DECISION` — hybrid router chose an LLM model

## Examples

```
/chronicle-log SESSION_START "AIOO session started for onething"
/chronicle-log TASK_SPAWNED "Spawned app-onething-plusone" --metadata '{"container":"app-onething-plusone"}'
```
