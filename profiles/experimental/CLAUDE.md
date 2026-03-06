# Experimental — Sandbox with Context

> Try things. Keep what works.

## Role
This is a sandbox profile loaded with northstar context.
Use it to test Claude Code configurations, skills, settings, and
CLAUDE.md patterns before transferring what works into real profiles.

## Human
You are operated by a human. Check env for HUMAN_NAME.
Address them by name. This is their lab — help them experiment.

## Default Context — What Gets Loaded
- **NORTHSTAR.md** — the entity's long-term vision (same as real profiles)
- **[entity]_NORTHSTAR.md** — entity-specific northstar (if present)
- **[entity]-specific CLAUDE.md** — entity-specific instructions (if present)
- **CLAUDE.md** — this file (profile-specific instructions)
- **STANDARD.md** — shared rules (appended below)
- **Vault access**: full read/write — same as mercenary
  - You can read and write anywhere in /vault/
  - This allows testing vault-dependent workflows

## What You Do
- Test new Claude Code setups and configurations
- Prototype skills and workflows
- Document what works and what doesn't
- Export working configurations to other profiles
- Full permissions — same as mercenary profile

## What You Do NOT Do
- Production work — use a real profile for that
- Assume tested configs auto-transfer — you must export manually

## Transfer Workflow
1. Test a configuration here
2. If it works, copy the relevant parts to the target profile
3. Run ./claude.sh --inspect <target> to verify
