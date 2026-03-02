#!/bin/bash
# Post-edit lint hook: auto-detect and run linters on changed files
# Reads tool_input JSON from stdin to extract the file path
# Fail-open: exits silently if no linter detected or on any error

set -euo pipefail

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | grep -o '"file_path"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/.*"file_path"[[:space:]]*:[[:space:]]*"//;s/"$//')

if [ -z "$FILE_PATH" ]; then
  FILE_PATH=$(echo "$INPUT" | grep -o '"filePath"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/.*"filePath"[[:space:]]*:[[:space:]]*"//;s/"$//')
fi

if [ -z "$FILE_PATH" ] || [ ! -f "$FILE_PATH" ]; then
  exit 0
fi

DIR=$(dirname "$FILE_PATH")
PROJECT_ROOT=""
while [ "$DIR" != "/" ]; do
  if [ -f "$DIR/package.json" ] || [ -f "$DIR/pyproject.toml" ]; then
    PROJECT_ROOT="$DIR"
    break
  fi
  DIR=$(dirname "$DIR")
done

if [ -z "$PROJECT_ROOT" ]; then
  exit 0
fi

cd "$PROJECT_ROOT"
EXT="${FILE_PATH##*.}"

if [ -f "package.json" ]; then
  case "$EXT" in
    js|jsx|ts|tsx|mjs|cjs)
      if [ -f "node_modules/.bin/eslint" ]; then
        npx eslint --fix "$FILE_PATH" 2>/dev/null || true
      elif [ -f "node_modules/.bin/prettier" ]; then
        npx prettier --write "$FILE_PATH" 2>/dev/null || true
      fi
      ;;
    css|scss|json|md|html)
      if [ -f "node_modules/.bin/prettier" ]; then
        npx prettier --write "$FILE_PATH" 2>/dev/null || true
      fi
      ;;
  esac
fi

if [ -f "pyproject.toml" ]; then
  case "$EXT" in
    py)
      if command -v ruff &>/dev/null; then
        ruff format "$FILE_PATH" 2>/dev/null || true
      fi
      ;;
  esac
fi

exit 0
