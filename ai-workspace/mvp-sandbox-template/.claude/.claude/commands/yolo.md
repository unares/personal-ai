IMPORTANT: This command enables YOLO mode (bypass all permission prompts). Follow these steps EXACTLY in order:

## Step 1: Display Warning

Show this to the user:

---
**YOLO MODE**

This will enable bypass-permissions mode:
- All bash commands execute without asking
- All file edits apply without confirmation
- All web fetches proceed without prompts
- No permission checks of any kind

This sandbox is an isolated Docker container — the blast radius is limited to this sandbox only.

---

## Step 2: Get Confirmation

Ask: "Type YES to enable YOLO mode, or anything else to cancel."

Wait for the user's response. If they do not type YES (case-insensitive), respond with "YOLO mode cancelled. No changes made." and STOP here.

## Step 3: Write Settings

If the user confirmed YES, do both of these:

**3a.** Write the file `/app/.claude/settings.json` with this exact content:
```json
{
  "permissions": {
    "defaultMode": "bypassPermissions"
  }
}
```

**3b.** Read `~/.claude/settings.json`. If it exists, parse it as JSON and add the key `"skipDangerousModePermissionPrompt": true`, then write it back. If it does not exist, create it with:
```json
{
  "skipDangerousModePermissionPrompt": true
}
```

## Step 4: Confirm and Exit

Display: "YOLO mode enabled. Restarting required for bypass permissions to take effect. Exiting now — type `claude` to re-enter with YOLO mode active."

Then execute `exit` to terminate this session.
