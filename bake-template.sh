#!/bin/bash
echo "🔨 Baking changes from personal-ai-platform-dev → Template..."
docker cp personal-ai-platform-dev:/app/.claude ai-workspace/DevSandbox-Template/.claude/ 2>/dev/null || true
docker cp personal-ai-platform-dev:/app/custom ai-workspace/DevSandbox-Template/custom/ 2>/dev/null || true
rm -f ai-workspace/DevSandbox-Template/.env 2>/dev/null
echo "✅ Template updated! Future sandboxes are pristine."
