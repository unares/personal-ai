# Inisio — App Dev Stage Workspace

A stage container workspace for building and iterating on the Inisio app.

## Entity Context

Entity: inisio
Vault: /vault/inisio/ (read-only)
Workspace: /workspace (app code, read-write)
Glossary: @/vault/inisio/INISIO_GLOSSARY.md
Vision: @/vault/inisio/INISIO_NORTHSTAR.md
Architecture: @/vault/ARCHITECTURE.md

## Context

This workspace contains Inisio app code for the current App Dev Stage.
Work happens here — in /workspace. Entity knowledge lives in /vault (read-only).
Drop observations and notes to /vault/inisio/Raw/ for vault ingestion.

## Where Files Live

- `/workspace/` = app code (this directory), read-write
- `/vault/inisio/` = entity knowledge, read-only
- `/vault/inisio/Raw/` = drop zone for notes and submissions

## Anti-Patterns

- Don't write code outside /workspace
- Don't modify vault files — use Raw/ for submissions only
- Don't access other entities' vaults
- Don't document features that don't exist yet
