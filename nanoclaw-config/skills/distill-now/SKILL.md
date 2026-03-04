# distill-now

Trigger immediate distillation of content via Context Extractor.

## Usage

```
/distill-now <entity> <title> <content>
```

## What This Does

Posts content to the Context Extractor's /ingest endpoint. The content is written to Raw/ and automatically processed by the file watcher (classify → distill → index).

## Implementation

```bash
ENTITY="${1:-$ENTITY}"
TITLE="$2"
CONTENT="$3"

curl -s -X POST "http://context-extractor:27125/ingest" \
  -H "Content-Type: application/json" \
  -d "{\"entity\": \"${ENTITY}\", \"title\": \"${TITLE}\", \"content\": \"${CONTENT}\"}"
```

## Examples

```
/distill-now onething "Q1 Review" "We decided to focus on PLG growth..."
```
