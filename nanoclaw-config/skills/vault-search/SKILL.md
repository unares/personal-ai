# vault-search

Full-text search across distilled vault content.

## Usage

```
/vault-search <query> [--category <category>] [--limit <n>]
```

## What This Does

Searches across all distilled content for the current entity. Returns matching entries with their metadata (category, trust score, source file).

## Implementation

```bash
ENTITY="${ENTITY:-onething}"
QUERY="$1"
CATEGORY="${2:+&category=$2}"
LIMIT="${3:-10}"

curl -s "http://context-extractor:27125/query?entity=${ENTITY}&q=${QUERY}${CATEGORY}&limit=${LIMIT}"
```

## Examples

```
/vault-search "product roadmap"
/vault-search "user feedback" --category shared-story
```
