# Personal AI Workspace

A containerized multi-agent AI workspace where humans and companion AIs collaborate on entity outcomes, earning full autonomy through demonstrated reliability.

## Entity Context

Default entity: ai-workspace
Glossary: @memory-vault/ai-workspace/AI_WORKSPACE_GLOSSARY.md
Vision: @memory-vault/ai-workspace/AI_WORKSPACE_NORTHSTAR.md

## Stack

- Shell scripts (bash), Docker, Node.js
- Claude Code CLI with profiles (ai-architect, co-founder)
- Memory vault per entity (`memory-vault/{entity}/`)
- Context Extractor (watches Raw/ → Memories/ → Distilled/)
- NanoClaw (container orchestrator inside agent containers)

## Terminology

See glossary above. Key rules:
- "Entity" not "company" or "project"
- "Companion AI" not "bot"
- Never abbreviate Personal AI Workspace

## Agent Roles

| Agent | Role | Vault Access |
|-------|------|-------------|
| Clark | Clarity Architect — philosophical brain | Distilled/ + Memories/ (read-only) |
| AIOO | AI Operating Officer — operational brain | Full vault (read-write) |

Agent identity: `containers/{agent}/CLAUDE.md` (injected as `~/.claude/CLAUDE.md` in container).
Project context: this file (mounted read-only at `/workspace/CLAUDE.md`).

## Operating Rules

- Functions < 30 lines. Files < 300 lines.
- Never invent requirements — work from NORTHSTAR.md and explicit instructions only.
- Commit often with clear, descriptive messages.
- Always work on a branch, never commit directly to main.
- Never force push. Ask before any git push if unsure.
- Run /compact when approaching 70% context usage.
- Use subagents for research-heavy tasks to protect main context.

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
