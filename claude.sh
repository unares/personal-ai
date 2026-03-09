#!/bin/bash
# Redirects to participate.sh — the single Claude Code entry point.
exec "$(dirname "${BASH_SOURCE[0]}")/participate.sh" "$@"
