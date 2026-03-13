# .md Constitution Template

> Every spec and knowledge .md file in Personal AI is a living document.

Recommended pattern for specification and knowledge files in memory-vault/.
Not required for operational files (CLAUDE.md, settings, scripts).

## Recommended Sections

### Scope
- What this document covers
- What it does NOT cover (explicit boundaries)

### Interfaces
- Who reads this document (agents, humans)
- Who writes/maintains this document
- What depends on this document

### Gamification Hooks
Opportunities for a future Gamification Agent. Not implemented — pipework for rapid future implementation.

Format:
```
- [ ] {Metric}: {what it measures} → {what progression looks like}
```

### Document History
Living changelog. Update when the document evolves.

## Conventions

- **Terminology**: Always use "entity". Never "company" or "project".
- **Living documents**: These evolve with the system. Review and update as code changes.
- **No implementation in gamification**: Only describe metrics and hooks.

## Document History
| Date | Change | Author |
|------|--------|--------|
| 2026-03-04 | Initial constitution pattern | System |
| 2026-03-09 | Removed mandatory language — pattern is recommended for spec docs, not all files | Michal |
