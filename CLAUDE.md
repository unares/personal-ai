# Personal AI Workspace

A containerized multi-agent AI workspace where humans and companion AIs collaborate on entity outcomes, earning full autonomy through demonstrated reliability.

## Entity Context

Default entity: ai-workspace
Glossary: @memory-vault/ai-workspace/AI_WORKSPACE_GLOSSARY.md
Vision: @memory-vault/ai-workspace/AI_WORKSPACE_NORTHSTAR.md

## Stack

- Shell scripts (bash), Docker, Node.js
- Claude Code CLI with profiles (technical, non-technical)
- Memory vault per entity (`memory-vault/{entity}/`)
- Context Extractor (watches Raw/ → Memories/ → Distilled/)
- NanoClaw (container orchestrator inside agent containers)

## Agent Roles

| Agent | Role | Vault Access |
|-------|------|-------------|
| Clark | Clarity Architect — philosophical brain | Distilled/ + Memories/ (read-only) |
| AIOO | AI Operating Officer — operational brain | Full vault (read-write) |

Agent identity: `containers/{agent}/CLAUDE.md` (injected as `~/.claude/CLAUDE.md` in container).
Project context: this file (mounted read-only at `/workspace/CLAUDE.md`).

## Where Files Live

- `project/` = code + config (CLAUDE.md, .claude/, containers/, setup/, docker-compose.yml)
- `memory-vault/` = all knowledge (NORTHSTARs, GLOSSARYs, Distilled/, Raw/, Logs/)
- Knowledge .md docs live in vault. @-import them from this file.

## Architecture Reference

@memory-vault/ARCHITECTURE.md

## Anti-Patterns

- Don't document features that don't exist yet in operational files
- Don't duplicate definitions across files
- Don't abbreviate entity or system names
- If it's not built, aspirational content goes in vault Raw/, not CLAUDE.md
