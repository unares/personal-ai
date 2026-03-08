---
name: glossary-watch
description: Observe conversation for terminology inconsistencies and suggest additions to the entity glossary
---

# Glossary Watch

Watch the conversation for domain terms that are:
- Used inconsistently (e.g., "PAI" instead of "Personal AI Workspace")
- New and not yet in the glossary
- Contradicting existing glossary entries

When you detect a terminology issue, present to the human:

```
TERM: "{term}"
CONTEXT: {how it was used and what the glossary says}

SUGGESTION:
  Option A: Add as prohibited — use "{correct_term}" instead
  Option B: Add as acceptable shorthand
  Option C: Skip — not worth tracking
```

On human choice, update `memory-vault/{entity}/{ENTITY}_GLOSSARY.md`.

Glossary location: `memory-vault/{entity}/{ENTITY}_GLOSSARY.md`
where `{entity}` comes from the ENTITY environment variable.
