# query-vault

Query the entity vault for distilled context via Context Extractor API.

## Usage

```
/query-vault <search-term> [--category <category>] [--limit <n>]
```

## What This Does

Searches the distilled vault content for the current entity. Results are scoped by the caller's role (AIOO sees specifications + shared-story, Clark sees personal-story + shared-story).

## Implementation

```bash
ENTITY="${ENTITY:-onething}"
CALLER="${ASSISTANT_NAME:-aioo}-${ENTITY}"
QUERY="$1"
CATEGORY="${2:+&category=$2}"
LIMIT="${3:-10}"

curl -s "http://context-extractor:27125/slice?entity=${ENTITY}&for=${CALLER}&query=${QUERY}${CATEGORY}&limit=${LIMIT}"
```

## Examples

```
/query-vault "brand strategy"
/query-vault "API schema" --category specification
/query-vault "team decisions" --limit 5
```
