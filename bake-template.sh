#!/bin/bash
# Personal AI v0.2 — Sandbox Factory: bake a role template into a named instance
# Usage: ./bake-template.sh <role> <name> <project>
# Example: ./bake-template.sh aioo my-aioo personal-ai
set -euo pipefail

ROLE=${1:?Usage: bake-template.sh <role> <name> [project]}
NAME=${2:?Usage: bake-template.sh <role> <name> [project]}
PROJECT=${3:-personal-ai}

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEMPLATES_DIR="${TEMPLATES_DIR:-$SCRIPT_DIR/templates}"
INSTANCES_DIR="${INSTANCES_DIR:-$SCRIPT_DIR/instances}"
NORTHSTAR_DIR="$SCRIPT_DIR/shared/northstar-summaries"

VALID_ROLES="clark aioo mvp-builder mission-control"
if ! echo "$VALID_ROLES" | grep -qw "$ROLE"; then
  echo "❌ Unknown role: $ROLE  (valid: $VALID_ROLES)"
  exit 1
fi

if [ ! -d "$TEMPLATES_DIR/$ROLE" ]; then
  echo "❌ Template not found: $TEMPLATES_DIR/$ROLE"
  exit 1
fi

DEST="$INSTANCES_DIR/$ROLE-$NAME"

# Guard against overwrite
if [ -d "$DEST" ]; then
  echo "⚠️  Instance already exists: $DEST"
  read -rp "Overwrite? [y/N] " confirm
  [[ "$confirm" =~ ^[Yy]$ ]] || { echo "Aborted."; exit 0; }
  rm -rf "$DEST"
fi

echo "→ Baking $ROLE instance: $NAME (project: $PROJECT)"
mkdir -p "$DEST"
cp -r "$TEMPLATES_DIR/$ROLE/." "$DEST/"

# Inject project-specific northstar summary
SUMMARY="$NORTHSTAR_DIR/$PROJECT.md"
if [ -f "$SUMMARY" ]; then
  cp "$SUMMARY" "$DEST/NORTHSTAR.md"
  echo "  ✓ Injected NORTHSTAR from $SUMMARY"
fi

# Stamp instance metadata
cat > "$DEST/.instance.env" <<EOF
ROLE=$ROLE
SANDBOX_ID=$ROLE-$NAME
PROJECT_ID=$PROJECT
CREATED_AT=$(date -u +%FT%TZ)
EOF

echo "✅ $DEST ready"
