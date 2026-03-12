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
2. Read ARCHITECTURE.md for structural overview
3. Scan `memory-vault/{entity}/Specifications/` for available specs
4. Check for an existing build order (from the architecture-design session)
   - If build order exists in conversation context or spec files: use it
   - If not: derive one from spec dependencies and present for agreement
5. Assess current build state: what's been built, what's next
6. Present to the user:
   - Specs found (list with one-line descriptions)
   - Current build state (what exists, what's pending)
   - Recommended next build step
   - "Ready to build {next component}?"

## Build Process

For each component in the build order:

### 1. Analyze (spec-analyst agent)

Before writing any code, launch the **spec-analyst** agent.
Read agent prompt from: `.claude/skills/architecture-build/agents/spec-analyst.md`

```
Agent task: "Read {spec path} and any referenced dependency specs.
            Produce a build brief for {component name}."
```

The agent returns a focused build brief: acceptance criteria, constraints,
interfaces, evaluation tests. This protects the main context from full spec
reading overhead.

Review the build brief with the human. Resolve any gaps before coding.

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

### 3. Validate (build-validator agent)

After building, launch the **build-validator** agent.
Read agent prompt from: `.claude/skills/architecture-build/agents/build-validator.md`

```
Agent task: "Validate {component} implementation against {spec path}.
            Check acceptance criteria, constraints, and evaluation design."
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

## Anti-Patterns During Build

1. **Spec Drift**: building something the spec doesn't describe. If you need it,
   it needs a spec first (even a lightweight one).
2. **Gold Plating**: adding features, refactoring, or "improving" beyond the spec.
   Build what's specified, nothing more.
3. **Skipping Validation**: "it works" is not validation. The spec's acceptance
   criteria are the definition of done, not a working demo.
4. **Silent Deviation**: changing an interface, skipping a constraint, or using a
   different approach without flagging it. Every deviation needs human agreement.

## Hard Stops

- No code without reading the spec first (use spec-analyst agent)
- No proceeding past a FAIL validation without human agreement
- No architectural decisions during build — hand back to architecture-design
- No skipping components in the build order without explicit agreement
- No updating Specifications/ files during build (those are design artifacts)
