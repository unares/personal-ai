# Identity Loading — Build Feedback (Rejected / Issues)

> Spec: `Planned/identity-loading.md`
> Purpose: Capture spec-engineering issues found during build for improving architecture-design.

## 2026-03-14 — Gap: Identity file content not persisted by architecture-design

**Issue:** The spec references 4 identity files (SOUL.md, AIOO_IDENTITY.md, CLARK_IDENTITY.md, UNARES_IDENTITY.md) in subtask 1 with the note "Content from design session." However, the design session drafted all 4 files, the human accepted them, and architecture-design failed to write them to `memory-vault/`. The build received the content as raw text pasted by the human.

**Severity:** gap (missing artifact — content existed but wasn't persisted)

**Responsible agent:** architecture-design verification agent

**Why this is an issue:** The spec's subtask 1 says "Content from design session" — implying the content exists somewhere. But it doesn't. The verification agent should have checked that all files referenced in the Decomposition table either (a) exist at their target paths, or (b) are explicitly marked as "content TBD, to be authored during build." Silent absence of accepted drafts wastes human time re-providing content.

**What was done:** Human provided the exact accepted drafts verbatim. Builder will use them without modification.

**Should have caught:** architecture-design verification agent needs a check: "For every file in the Decomposition table that says 'from design session' — verify the file exists at the target path. If not, write it or flag the gap before concluding the design session."

## 2026-03-14 — Gap: Rename operations not surfaced as design-time concern

**Issue:** The Unares spec requires 3 major renames (`containers/clark/` → `containers/ephemeral-companion/`, `clark:latest` → `ephemeral-companion:latest`, `clark-net` → `ephemeral-companion-net`) touching 40+ locations across source code, tests, and 10+ Built spec files. This scope should have been identified and flagged during architecture-design — possibly as its own subtask with an explicit impact map — rather than discovered during build-time spec analysis.

**Severity:** gap (missing analysis — the renames are correct but the blast radius was unstated)

**Responsible agent:** architecture-design (spec-engineering phase)

**Why this is an issue:** Renames with 40+ touchpoints are high-risk operations. A build session discovering this scope for the first time burns analysis tokens that should have been spent during design. The spec's Decomposition table lists "Rename clark:latest → ephemeral-companion:latest" as a 30min subtask — severely underestimated for 40+ file changes.

**What was done:** spec-analyst grepped the entire codebase and produced a complete Rename Impact Map during build analysis.

**Should have caught:** architecture-design should include a "Rename Impact Analysis" step for any spec that renames files, images, networks, or constants. The step should grep the codebase for all occurrences, list every file touched, and include the count in the Decomposition estimate. The spec-reviewer should flag any rename subtask estimated under 1h when it touches more than 5 files.
