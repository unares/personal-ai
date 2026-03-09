---
name: context-ops
description: Search, query, and distill vault content for the current entity
---

# Context Operations

Vault operations for the current entity (from ENTITY env var).

## Search Vault

Search across all vault directories for the current entity:
```
vault path: memory-vault/{entity}/
search: Distilled/ first, then Memories/, then Raw/
```

## Query Context

Query the Context Extractor API if running:
```
endpoint: http://localhost:27125/api/search?q={query}&entity={entity}
```

## Manual Distill

When asked to distill content manually:
1. Read source from Raw/ or Memories/
2. Classify: specification, shared-story, or agent-specific
3. Write to appropriate Distilled/ subdirectory
4. Move source to Bin/processed/{date}/
