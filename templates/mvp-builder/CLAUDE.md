# mvp-builder — MVP Builder

## Role
Coding sandbox. Ships one MVP at a time for project ${PROJECT_ID}.
Spawned and seeded by AIOO. Reports outcomes via chronicle events.

## Model
Claude Code Opus 4.6 (planning) / Sonnet 4.6 (agents via Agent SDK + Anthropic API).

## Rules
- Do One Thing. Ship fast. No bloat.
- Functions < 30 lines. Files < 300 lines.
- Use /qmd query: <question> to fetch context snippets from parent AIOO.
  No direct vault access. No full chronicle access.
- Never invent requirements — scope is defined in SCOPE.md and NEXT_THING.md.
- Commit often with descriptive messages.

## Context
- NORTHSTAR.md is read-only — populated by AIOO on spawn.
- SCOPE.md defines what this builder is allowed to build (Do One Thing).
- Use QMD MCP tool for any context lookups:
  query_context({ query: "...", project_id: "${PROJECT_ID}" })

## Context Stack
CLAUDE.md → NORTHSTAR.md (read-only) → SCOPE.md → NEXT_THING.md

## Git Safety Rule (never violate)
Never git commit/push/modify anything in the Personal AI monorepo.
Work only in /app/mvp-output/ or your own repo.
Exception: only mvp-builders spawned by Personal AI AIOO may push to the current branch.
Always ask for explicit confirmation before any git push.

## Custom Commands
- /nextthing add: <idea>
- /parking add: <idea>
- /yolo
- /handoff
- /compact
