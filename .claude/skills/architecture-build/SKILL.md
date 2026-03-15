---
name: architecture-build
description: Spec-driven implementation with analyst and validator agents — builds from architecture-design output
---

# Architecture Build Mode

You are now in spec-driven build mode. Build methodically. Validate continuously.
Every line of code traces back to a specification.

Related skill: `/architecture-design` (produces the specs this skill builds from).

## On Load Protocol

1. Detect entity context (from ENTITY env var or working directory)
2. Read SYSTEM_ARCHITECTURE.md for structural overview and Perspective Map
3. Scan `memory-vault/{entity}/Specifications/Planned/` for specs to build
4. Scan `memory-vault/{entity}/Specifications/Built/` for existing component specs
   (these are living reference docs for cross-spec consistency during build)
5. Read the **Build Order** section in ARCHITECTURE.md — this is the authoritative
   build sequence. Follow it exactly. Do not derive or propose an alternative order.
   - If no Build Order section exists: derive one from spec dependencies and present
     for agreement before proceeding
6. Assess current build state: what's been built, what's next
6. Present to the user:
   - Specs found (list with one-line descriptions)
   - Current build state (what exists, what's pending)
   - Recommended next build step
   - "Ready to build {next component}?"

> Git status is surfaced automatically by the global Git Session Awareness rule
> (status-check mode triggers on session start with existing branch commits).
> No explicit call needed here — it will run before you ask "Ready to build?".

## Build Process

For each component in the build order:

### 1. Analyze (spec-analyst agent)

Before writing any code, launch the **spec-analyst** agent.
Read agent prompt from: `.claude/skills/architecture-build/agents/spec-analyst.md`

```
Agent task: "Read {spec path} and any referenced dependency specs.
            Produce a build brief for {component name}."
Model: opus (high-effort analysis — always use Opus 4.6 for spec-analyst)
```

The agent returns a focused build brief: acceptance criteria, constraints,
interfaces, evaluation tests. This protects the main context from full spec
reading overhead.

**Built component modification**: when the spec modifies a built component (renames
a file, changes an IPC schema, adds mounts to docker-compose, updates a handler),
the spec-analyst MUST read the actual source code — not just the built spec — before
producing the build brief. The build brief must confirm:
- The file exists at the path the spec expects
- All importers of the old name (for renames — grep the codebase before touching)
- Current state of the built code before the modification

For rename operations specifically: instruct the spec-analyst to grep for the old
name across the project before building. Incomplete renames are a common build failure.
Document every file touched in the build log.

**Multi-module layers**: When building multiple tightly-coupled modules together,
instruct the spec-analyst to produce a Cross-Module Dependency Map first, then
per-module briefs. Review the dependency map before reviewing individual briefs —
it sets the build order and surfaces wiring patterns that prevent false blockers.

Review the build brief with the human:
- **Ready to Build** → proceed
- **Ready with Pre-Build Decisions** → present proposed defaults, get human agreement, then proceed
- **Needs Resolution** → stop, hand to `/architecture-design`

### 2. Build

Implement against the build brief:
- Acceptance criteria are pass/fail gates — every one must be met
- Must-not-do constraints are blockers — any violation stops the build
- Preferences guide style but can be overridden with justification
- Interfaces must match spec-defined schemas exactly

Build discipline:
- Functions < 30 lines. Files < 300 lines.
- One component at a time. Complete it before starting the next.
- If a design issue surfaces during build, flag it — don't silently deviate.
  Major design issues may require handing back to `/architecture-design`.
- **Module singleton pattern**: when building module-level caches or registries,
  add a `_clearXxx()` / `force` flag test helper immediately. This prevents test
  cross-contamination without changing production behaviour. Do this before writing tests.
- **Bash script testability**: when building bash scripts, add the sourcing guard
  and env var overrides **before writing any logic** — retrofitting is painful:
  ```bash
  VAR="${VAR:-default_value}"   # all config via env vars with defaults
  # ... function definitions ...
  if [ "${SCRIPT_SOURCED:-}" != "1" ]; then main "$@"; fi
  ```
  Tests source the script with `SCRIPT_SOURCED=1` and override vars via env.
  Mock docker/curl/etc. as bash function overrides in the test file.
  Use `${!#}` to get the last argument in a mock (handles flags before the target).
- **Stub decisions**: if a handler or module is deliberately stubbed (e.g. pending
  external channel setup), log it as a build decision in `Logs/` with the explicit
  condition for full implementation. A code comment is not enough — it must be
  traceable so the next build session picks it up.
- **Perspective framing**: when building a container's CLAUDE.md, verify the
  @-import for architecture matches the Perspective Map in SYSTEM_ARCHITECTURE.md.
  Each container @-imports exactly one architecture file. Consult the map —
  don't guess which perspective applies.

### 3. Validate (build-validator agent)

After building, launch the **build-validator** agent.
Read agent prompt from: `.claude/skills/architecture-build/agents/build-validator.md`

```
Agent task: "Validate {component} implementation against {spec path}.
            Check acceptance criteria, constraints, evaluation design,
            gitignore status of config files, and local test runability."
Model: opus (high-effort validation — always use Opus 4.6 for build-validator)
```

The agent returns a compliance report: pass/fail per criterion with evidence.

- All PASS → component complete, move to next in build order
- Any FAIL → fix before proceeding
- PARTIAL → discuss with human (acceptable for Phase 1?)

### 4. Log

After validation passes:
- Log build completion: ISO timestamp + component + validation status → `Logs/`
- If any implementation decisions deviated from spec preferences, log the
  deviation and rationale

## Decision Logging During Build

Implementation decisions belong in `Logs/`, not in `Specifications/`.

Spec decisions (architectural, documented in Specifications/) don't change during build.
Build decisions (implementation choices within spec constraints) are logged:

```
## {ISO timestamp} — Build: {component}
Decision: {what was decided}
Rationale: {why}
Spec reference: {which spec/constraint this relates to}
```

If a build decision reveals a spec gap or contradiction:
1. Flag to the human immediately
2. Resolve before continuing
3. If resolution requires architectural change → hand back to `/architecture-design`

## Handoff Back to Design

When a design issue is discovered during build:

1. Stop building the current component
2. Describe the issue: what the spec says, what reality requires, why they conflict
3. Suggest: "This needs a design decision. Use `/architecture-design` to resolve,
   then return here to continue building."

Do not make architectural decisions during build. Build implements, design decides.

## Handoff Forward

When all components in the build order are built and validated:

1. Run build-validator against every component (full system validation)
2. Update ARCHITECTURE.md to reflect the built reality (not aspirational — actual)
3. Present final build report to the human:
   - Components built (with validation status)
   - Deviations from spec (with rationale)
   - ARCHITECTURE.md changes made
4. Recommend what to verify manually (integration points, security checks)

> Build complete = git handoff trigger. The global Git Session Awareness rule
> will surface PR description, changelog draft, merge/tag/next-branch proposals
> automatically. Signal completion ("build complete", "all validated", "ready to PR")
> and it fires. Await approval before any git actions execute.

## Anti-Patterns During Build

1. **Spec Drift**: building something the spec doesn't describe. If you need it,
   it needs a spec first (even a lightweight one).
2. **Gold Plating**: adding features, refactoring, or "improving" beyond the spec.
   Build what's specified, nothing more.
3. **Skipping Validation**: "it works" is not validation. The spec's acceptance
   criteria are the definition of done, not a working demo.
4. **Silent Deviation**: changing an interface, skipping a constraint, or using a
   different approach without flagging it. Every deviation needs human agreement.

## Rejected/ Feedback Loop

During build, when the spec-analyst, builder, or build-validator finds spec issues
(gaps, inconsistencies, wrong assumptions), record them in
`Specifications/Rejected/{spec-name}.md` — same filename as the source spec.

Purpose: post-build review to improve architecture-design and its agents.
This creates a traceable improvement trail for spec-engineering.

### When to write to Rejected/

- Spec says "from design session" but the artifact doesn't exist
- Spec contradicts built reality (paths, schemas, interfaces)
- Spec makes unstated assumptions that caused a build problem
- Missing acceptance criteria or evaluation tests discovered during build
- Cross-spec inconsistencies caught during build but not during design

### Entry format

```markdown
## {ISO timestamp} — {Category}: {one-line summary}

**Issue:** {what's wrong}
**Severity:** gap | inconsistency | assumption
**Responsible agent:** architecture-design | spec-reviewer | verification-agent
**Why this is an issue:** {impact on build}
**What was done:** {fix/mitigation applied}
**Should have caught:** {what check or prompt addition would have prevented this}
```

Append new entries to the same file as issues are discovered — don't wait until
the end of the session. Context compression may lose details.

## Hard Stops

- No code without reading the spec first (use spec-analyst agent)
- No proceeding past a FAIL validation without human agreement
- No architectural decisions during build — hand back to architecture-design
- No skipping components in the build order without explicit agreement
- No updating Specifications/ files during build (those are design artifacts)
- After build validation passes: move spec from Planned/ → Built/ (living doc)
- If build reveals rejected design chunks: record in Rejected/ with matching filename
