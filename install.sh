#!/bin/bash
set -e
echo "🚀 Installing Personal AI (Mission Control) v0.1..."
docker compose up -d --build
if [ ! -d "obsidian-vault/projects/personal-ai-mvp-sandbox" ]; then
  mkdir -p obsidian-vault/projects/personal-ai-mvp-sandbox
  cp -r ai-workspace/mvp-sandbox-template/. obsidian-vault/projects/personal-ai-mvp-sandbox/ 2>/dev/null || true
fi
echo "✅ Mission Control: http://localhost:3002"
echo "✅ Sandbox: docker compose exec -it personal-ai-mvp-sandbox bash"
open http://localhost:3002 2>/dev/null || true
