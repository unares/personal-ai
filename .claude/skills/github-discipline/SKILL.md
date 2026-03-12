---
name: github-discipline
description: Git status visualization, branch proposals, PR generation, and changelog — runs as an agent to protect main context window
---

# GitHub Discipline

Launch the github-status agent to assess repository state and propose actions.

```
Agent prompt: .claude/skills/github-discipline/agents/github-status.md
Model: sonnet
Mode: "status-check" (standalone invocation — show full status + all proposals)
```

No git changes are made without your explicit approval.
Always shows `code {path}` for any file you may want to edit (NORTHSTAR, CHANGELOG.md).
