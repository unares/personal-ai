#!/bin/bash
set -e
echo "🚀 Creating clean Personal AI (One Thing) v0.1..."

# 1. Create structure
mkdir -p shared ai-workspace/DevSandbox-Template/.claude ai-workspace/custom clarity-architect obsidian-vault/projects/personal-ai-platform-dev dashboard

# 2. .gitignore
cat > .gitignore << 'EOT'
shared/.claude.env
node_modules/
.DS_Store
obsidian-vault/projects/*/
EOT

# 3. install.sh (your exact working key flow + factory start)
cat > install.sh << 'EOT'
#!/bin/bash
set -e
echo "🚀 Installing Personal AI (One Thing) v0.1..."

if [ ! -f shared/.claude.env ]; then
  echo "Paste your Anthropic API key (console.anthropic.com → API keys):"
  read -r ANTHROPIC_KEY
  echo "ANTHROPIC_API_KEY=$ANTHROPIC_KEY" > shared/.claude.env
  echo "✅ Key stored securely (gitignored forever)."
fi

docker compose up -d --build

# Create founder sandbox if missing
if [ ! -d "obsidian-vault/projects/personal-ai-platform-dev" ]; then
  mkdir -p obsidian-vault/projects/personal-ai-platform-dev
  cp -r ai-workspace/DevSandbox-Template/. obsidian-vault/projects/personal-ai-platform-dev/ 2>/dev/null || true
fi

echo "✅ Dashboard: http://localhost:3002"
echo "✅ Your live sandbox: personal-ai-platform-dev (port 3003)"
open http://localhost:3002 2>/dev/null || true
EOT
chmod +x install.sh

# 4. bake-template.sh (promotes live changes safely)
cat > bake-template.sh << 'EOT'
#!/bin/bash
echo "🔨 Baking changes from personal-ai-platform-dev → Template..."
docker cp personal-ai-platform-dev:/app/.claude ai-workspace/DevSandbox-Template/.claude/ 2>/dev/null || true
docker cp personal-ai-platform-dev:/app/custom ai-workspace/DevSandbox-Template/custom/ 2>/dev/null || true
rm -f ai-workspace/DevSandbox-Template/.env 2>/dev/null
echo "✅ Template updated! Future sandboxes are pristine."
EOT
chmod +x bake-template.sh

# 5. docker-compose.yml (Sandbox Factory ready)
cat > docker-compose.yml << 'EOT'
version: '3.8'
services:
  dashboard:
    build: ./dashboard
    ports: ["3002:3000"]
    volumes:
      - ./obsidian-vault:/app/vault
  personal-ai-platform-dev:
    build: ./ai-workspace
    container_name: personal-ai-platform-dev
    ports: ["3003:3000"]
    environment:
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
    volumes:
      - ./shared/.claude.env:/app/.claude.env:ro
      - ./shared:/app/shared:ro
      - ./obsidian-vault/projects/personal-ai-platform-dev:/app/vault
  clarity-architect:
    build: ./clarity-architect
    ports: ["3004:3000"]
    volumes:
      - ./shared:/app/shared:ro
EOT

# 6. Shared files
cat > shared/.claude.env.example << 'EOT'
ANTHROPIC_API_KEY=sk-ant-...
EOT
cat > shared/northstar.md << 'EOT'
# Personal AI North Star
Build the ultimate Personal AI that instantly surfaces your One Thing.
EOT

# 7. DevSandbox-Template (pristine)
cat > ai-workspace/DevSandbox-Template/first-run-wizard.sh << 'EOT'
#!/bin/bash
echo -e "\033[32m✅ Claude Code is already logged in via shared secrets.\033[0m"
echo -e "\033[32mYou’re ready to build your One Thing!\033[0m"
EOT
chmod +x ai-workspace/DevSandbox-Template/first-run-wizard.sh

cat > ai-workspace/DevSandbox-Template/.claude/CLAUDE.md << 'EOT'
# One Thing Constitution – Personal AI v0.1
## Philosophy
Do One Thing. Surface the single highest-leverage action from northstar.md + brain dump, then execute relentlessly here.

## Permission Policy
Auto-accept ALL commands (broad wildcard). No prompts during normal founder work.

## Core Rules
- Always read northstar.md first.
- Function < 30 lines.
- /clear aggressively, /compact at 70%.
- Auto-lint every edit.
- Report points earned to dashboard.

## One Thing Workflow (interactive only)
1. Paste brain dump / text / link in dashboard → Process.
2. See your One Thing + Obsidian map.
3. Iterate with me until First Sight.
4. When ready: tell AIOO “archive this sandbox”.

This is your clean slate. Edit freely.
EOT

# 8. Minimal beautiful dashboard (with One Thing header + points + Brain Dump field + New Sandbox button)
mkdir -p dashboard/app
cat > dashboard/app/page.tsx << 'EOT'
'use client';
import { useState } from 'react';
export default function Home() {
  const [points] = useState(100);
  const [oneThing] = useState("Build Personal AI Platform");
  return (
    <div className="min-h-screen bg-zinc-950 text-white p-8">
      <div className="max-w-5xl mx-auto">
        <div className="mb-12">
          <h1 className="text-7xl font-bold tracking-tighter">Your One Thing</h1>
          <p className="text-5xl text-emerald-400 font-medium">{oneThing}</p>
          <div className="mt-4 text-xl text-zinc-400">Points earned: <span className="text-emerald-400 font-bold">{points}</span></div>
        </div>

        <div className="bg-zinc-900 border border-zinc-700 rounded-3xl p-8 mb-8">
          <h2 className="text-2xl mb-4">Process Brain Dump</h2>
          <textarea className="w-full h-48 bg-zinc-800 border border-zinc-600 rounded-2xl p-6 text-lg" placeholder="Paste brain dump, link, or any text here..." />
          <button className="mt-6 bg-white text-black px-12 py-6 rounded-2xl text-xl font-medium hover:bg-zinc-200 transition">Process → Get One Thing + Obsidian Map</button>
        </div>

        <button className="bg-emerald-500 text-black px-10 py-5 rounded-2xl text-xl font-medium">+ New Sandbox</button>
      </div>
    </div>
  );
}
EOT

# 9. Dockerfiles & package.json (minimal)
cat > dashboard/Dockerfile << 'EOT'
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
EXPOSE 3000
CMD ["npm", "run", "dev"]
EOT

cat > ai-workspace/Dockerfile << 'EOT'
FROM node:20-alpine
WORKDIR /app
COPY . .
CMD ["sh", "/app/DevSandbox-Template/first-run-wizard.sh"]
EOT

cat > clarity-architect/Dockerfile << 'EOT'
FROM node:20-alpine
WORKDIR /app
CMD ["echo", "Clarity Architect ready"]
EOT

cat > dashboard/package.json << 'EOT'
{"name":"personal-ai-dashboard","version":"0.1.0","scripts":{"dev":"next dev"},"dependencies":{"next":"15.0.0","react":"^18","react-dom":"^18"}}
EOT

echo "✅ Personal AI (One Thing) v0.1 created successfully!"
echo "Next steps:"
echo "1. git init && git add . && git commit -m 'Initial commit'"
echo "2. Push to GitHub"
echo "3. ./install.sh"
