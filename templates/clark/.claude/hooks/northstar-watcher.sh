#!/bin/bash
# Clark northstar watcher — polls northstar-summaries/ every 60s
# Run in background on container start: nohup .claude/hooks/northstar-watcher.sh &
SUMMARIES_DIR="${SUMMARIES_DIR:-/app/shared/northstar-summaries}"
PERSON_ID="${PERSON_ID:-founder}"

while true; do
  # Pick the first available summary (or project-specific if PROJECT_ID is set)
  if [ -n "${PROJECT_ID:-}" ] && [ -f "$SUMMARIES_DIR/$PROJECT_ID.md" ]; then
    cp "$SUMMARIES_DIR/$PROJECT_ID.md" /app/NORTHSTAR.md
  else
    for f in "$SUMMARIES_DIR"/*.md; do
      [ -f "$f" ] && cp "$f" /app/NORTHSTAR.md && break
    done
  fi
  sleep 60
done
