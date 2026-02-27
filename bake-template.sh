#!/bin/bash
echo "🔨 Baking personal-ai-mvp-sandbox → mvp-sandbox-template..."
docker cp personal-ai-mvp-sandbox:/app/.claude ai-workspace/mvp-sandbox-template/.claude/ 2>/dev/null || true
docker cp personal-ai-mvp-sandbox:/app/custom ai-workspace/mvp-sandbox-template/custom/ 2>/dev/null || true
rm -f ai-workspace/mvp-sandbox-template/.env 2>/dev/null
echo "✅ Template updated!"
