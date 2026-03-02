Generate a HANDOFF.md file in the project root that captures the current session state. Write it using this exact structure:

```markdown
# Session Handoff
*Generated: [current date/time]*

## What Was Accomplished
- [List concrete things completed this session — features shipped, bugs fixed, files created/modified]

## Currently In Progress
- [Anything started but not finished — partial implementations, incomplete refactors]
- [Include file names and line numbers where relevant]

## What's Next
- [Immediate next steps that should be picked up]
- [Any blockers or dependencies]

## Key Decisions Made
- [Architecture choices, library selections, approach decisions made during this session]
- [Include the reasoning so the next session has context]

## Files Changed
- [List of files modified/created this session with brief description of changes]
```

Instructions:
1. Review the conversation history to extract all relevant information
2. Be specific — include file paths, function names, and concrete details
3. Write the file to the project root as `HANDOFF.md`
4. If a HANDOFF.md already exists, overwrite it (it's a snapshot, not a log)
5. After writing, confirm with: "Handoff saved. Next session can pick up from HANDOFF.md."
