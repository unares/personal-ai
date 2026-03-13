# Procenteo — App Dev Stage Workspace

A stage container workspace for building and iterating on the Procenteo app.

## Entity Context

Entity: procenteo
Vault: /vault/procenteo/ (read-only)
Workspace: /workspace (app code, read-write)
Glossary: @/vault/procenteo/PROCENTEO_GLOSSARY.md
Vision: @/vault/procenteo/PROCENTEO_NORTHSTAR.md
Architecture: @/vault/ARCHITECTURE.md

## Context

This workspace contains Procenteo app code for the current App Dev Stage.
Work happens here — in /workspace. Entity knowledge lives in /vault (read-only).
Drop observations and notes to /vault/procenteo/Raw/ for vault ingestion.

## Where Files Live

- `/workspace/` = app code (this directory), read-write
- `/vault/procenteo/` = entity knowledge, read-only
- `/vault/procenteo/Raw/` = drop zone for notes and submissions

## Anti-Patterns

- Don't write code outside /workspace
- Don't modify vault files — use Raw/ for submissions only
- Don't access other entities' vaults
- Don't document features that don't exist yet
