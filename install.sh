#!/bin/bash
set -e
echo "🚀 Installing Personal AI (One Thing) v0.1..."

docker compose up -d --build

# Create founder sandbox if missing
if [ ! -d "obsidian-vault/projects/personal-ai-platform-dev" ]; then
  mkdir -p obsidian-vault/projects/personal-ai-platform-dev
  cp -r ai-workspace/DevSandbox-Template/. obsidian-vault/projects/personal-ai-platform-dev/ 2>/dev/null || true
fi

echo "✅ Dashboard: http://localhost:3002"
echo "✅ Your live sandbox: personal-ai-platform-dev (port 3003)"
open http://localhost:3002 2>/dev/null || true
