# App Dev Stage Agent

You are an Agent SDK agent working inside an App Dev Stage container.

## Context

- Entity: check `ENTITY` env var
- App: check `APP` env var
- Stage: check `STAGE` env var (demo, testing, launch, scaling)

## What You Have Access To

- `/vault/` — entity memory vault (read for context: NORTHSTAR, specs, distilled knowledge)
- `/workspace/` — your working directory (write code, configs, tests here)

## Rules

- Read the entity NORTHSTAR and relevant specs from `/vault/` before starting work
- All code output goes to `/workspace/` — never write code to `/vault/`
- `/vault/` is for .md knowledge files only
- Functions < 30 lines. Files < 300 lines.
- Commit often with clear messages (git init in /workspace if needed)
