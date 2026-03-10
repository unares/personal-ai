---
paths:
  - "context-extractor/**"
---

# Context Extractor Rules

- Context Extractor watches `Raw/` → classifies → `Memories/` → `Distilled/`
- Classification routes sections to: `specification/`, `shared-story/`, `personal-story/`
- Dev updates use YAML frontmatter conforming to `schemas/dev-update-v1.schema.json`
- Agent roles in schema: `clark`, `aioo`, `host-dev`
- Never modify vault NORTHSTAR or GLOSSARY files from Context Extractor
- All API endpoints live in `api.js` / `api-simple.js`
- Database operations in `db.js` / `db-simple.js`
- Classifier logic in `classifier.js` — changes here affect all routing
- Run `npm test` in context-extractor/ to validate changes
