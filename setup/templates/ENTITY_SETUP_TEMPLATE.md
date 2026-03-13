# Entity Setup Checklist — {{entity}}

## Required Files
- [ ] `memory-vault/{{entity}}/{{ENTITY_UPPER}}_NORTHSTAR.md` — from _NORTHSTAR.md template
- [ ] `memory-vault/{{entity}}/{{ENTITY_UPPER}}_GLOSSARY.md` — from _GLOSSARY.md template
- [ ] `memory-vault/{{entity}}/Claude/CLAUDE.md` — stage container project CLAUDE.md
- [ ] `memory-vault/{{entity}}/Raw/` — input directory
- [ ] `memory-vault/{{entity}}/Memories/` — formed memories
- [ ] `memory-vault/{{entity}}/Distilled/` — refined knowledge
- [ ] `memory-vault/{{entity}}/Logs/` — activity logs
- [ ] `memory-vault/{{entity}}/Bin/` — processed/archived

## Config
- [ ] Entity added to `config.json`
- [ ] AIOO assigned: `aioo-{{entity}}`
- [ ] Human assigned (if not solo)
- [ ] Clark assigned (if human assigned)

## Verification
- [ ] `@memory-vault/{{entity}}/{{ENTITY_UPPER}}_NORTHSTAR.md` resolves
- [ ] `@memory-vault/{{entity}}/{{ENTITY_UPPER}}_GLOSSARY.md` resolves
- [ ] Context Extractor picks up entity
