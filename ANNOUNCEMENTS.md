# Personal AI — Global Announcements

System-wide updates. Read this file before starting any session.
Agents: Clark, AIOO, App Builder, Content Loader — this applies to all of you.

---

## [2026-03-02] Clark + AIOO Launchers — Full System Now Live

### What Changed

**`clark.sh`** — spawn your Clark. Reads `config.json`, mounts correct `Distilled/Clark/` dirs per person scope. Owner Clark sees all entities. Human Clarks see only their entity.

**`aioo.sh <entity>`** — spawn an entity AIOO. Mounts full entity vault read-write. NORTHSTAR available at `/vault/NORTHSTAR.md`.

**`verify.sh`** — system health check. Run it any time to confirm config, vault structure, Content Loader, and containers.

**`docker-compose.yml` cleaned** — stripped to Content Loader only. All other containers use launcher scripts (`clark.sh`, `aioo.sh`, `app-builder.sh`). No more hardcoded services, no more Gemini/SQLite v0.1 artifacts.

### The Complete Personal AI v0.2 Stack

```
./install.sh              → guided setup, creates config.json + vault
./clark.sh [person]       → spawn Clark for owner or any human
./aioo.sh <entity>        → spawn AIOO for an entity
./app-builder.sh <entity> <app> → spawn App Builder for an app
./add-entity.sh           → add new entity to live system
./add-human.sh            → add human to an entity
./verify.sh               → health check everything
```

All containers read `ANNOUNCEMENTS.md` at session start.

---

## [2026-03-02] Human Model — "Founder/Co-founder" is now "Human"

### What Changed

**"Founder" and "Co-founder" are replaced by "Human" everywhere.**
**`add-founder.sh` → `add-human.sh`.**
**A Human gets a Clark AND full AIOO access — not just read-only context.**
**Solo prompt is now simply: `Is [entity] a solo entity? [y/n]`**

### Why Human

"Founder" and "Co-founder" describe legal roles and origin stories. They impose hierarchy (who founded first?) and imply a startup context that not every entity has.

"Human" is simpler and more accurate. Inside Personal AI, the relevant distinction is not who founded what — it is whether another **human** is jointly responsible for an entity. If yes, they get a Clark and AIOO access. That's it.

The system doesn't care about equity splits, titles, or founding dates. It cares about: who has agency over this entity? Those are the Humans.

### What Humans Get

When a Human is added to an entity they receive:

| Access | What | Mode |
|--------|------|------|
| `clark-{name}` | Their personal AI compass | Scoped to entity Distilled/ |
| AIOO access | Full co-driver of the entity AIOO | Read + directive |

Previously co-founders only got a Clark scoped to `Distilled/Clark/`. Humans now get full AIOO co-access — they can direct the entity's AI Operating Officer, not just read its summaries.

### New Confirmation Flow

During setup or `add-human.sh`:
```
Is [entity] a solo entity? [y/n]:  n
Human's first name:  mateusz

You and Mateusz will be jointly responsible for
the procenteo entity. Mateusz gets a Clark and
full access to the procenteo AIOO.

Do you want to proceed? [y/n]:
```

### config.json Schema (updated)

```json
{
  "clarks": [
    { "name": "clark-mateusz", "projects": ["procenteo"], "aioo_access": true }
  ],
  "entities": [
    {
      "name": "procenteo",
      "solo": false,
      "human": "mateusz",
      "human_clark": "clark-mateusz"
    }
  ]
}
```

Fields `"cofounder"` and `"cofounders_clark"` are retired. Content Loader reads `entities` (falling back to `projects` for backward compatibility).

---

## [2026-03-02] Entity Model — "Company/Project" is now "Entity"

### What Changed

**The term "Company/Project" is replaced by "Entity" everywhere.**
**New scripts: `add-entity.sh` and `add-founder.sh`.**
**Co-founder setup can now be skipped during install and added later.**

### Why Entity

"Company" implies a legal structure. "Project" implies a deliverable. Neither captures what OneThing, Procenteo, and Inisio actually are inside Personal AI: **autonomous organizational units**, each with their own vault, their own AIOO, their own northstar, and their own set of Apps being built under them.

An Entity is the right abstraction. It is the owner of a vault. It is what an AIOO operates. It is what Apps are built under. It can be a company, a research project, a side hustle, or a personal initiative — the system doesn't care. It treats it as an Entity.

### Vocabulary Reference (updated)

| Old term | New term |
|----------|----------|
| Company / Project | **Entity** |
| Add company | `./add-entity.sh` |
| Co-founder (setup only) | `./add-founder.sh` (anytime) |
| `config.json: "projects": []` | `config.json: "entities": []` |
| `Raw/MVPs/` | `Raw/Apps/` |

### New Scripts

**`add-entity.sh`** — add a new entity to a running system:
- Reads `config.json`, validates no duplicates
- Asks entity name + solo/co-founder/skip
- Appends to `entities[]` and updates owner clark's project list
- Creates vault dirs, seeds northstar, restarts Content Loader

**`add-founder.sh`** — add a co-founder to any entity at any time:
- Lists existing entities, prompts which one
- Asks co-founder's first name
- Creates `clark-{name}` scoped to that entity only
- Updates `config.json`, no vault dir changes needed

### Skip & Add Later

During `./install.sh`, the co-founder prompt now accepts `[k]` to skip:
```
Solo founder, co-founder, or skip for now? [s/c/k]:
```
Choosing `k` creates the entity as solo for now. Run `./add-founder.sh` anytime to add the co-founder's Clark. The entity record is updated automatically.

---

## [2026-03-02] v0.2 Architecture Shipped — App Builder Era Begins

### What Changed

**The MVP Builder is now the App Builder.**
**The vault is now per-company isolated.**
**config.json is now the source of truth for the entire system.**

This is not a rename. This is a architectural consolidation reflecting what we actually built.

---

### The Story

We started today with a flat, single-vault structure. One folder. One watcher. One company assumed.

That was fine for v0.1. But v0.1 was an experiment — it proved the concept that a founder could have an AI system that remembered context, watched notes, distilled summaries, and spawned isolated build environments on demand. It worked. We shipped it.

v0.2 is the real thing.

Today we rebuilt the core from first principles, with three companies in mind (OneThing, Procenteo, Inisio), co-founders with scoped access, and the hard requirement that no company's context should ever bleed into another. We did it in one session.

**What we shipped:**

1. **Multi-company vault isolation** — each company gets its own `chronicle-vault/{company}/` tree with `Raw/`, `Distilled/`, `Archive/`, `Logs/`, and its own `{COMPANY}_NORTHSTAR.md`. Zero shared state between companies.

2. **config.json as the operating system** — one file, generated by `install.sh`, drives Content Loader watchers, Clark access control, AIOO assignment, co-founder scoping. Every agent reads from this. Nothing is hardcoded.

3. **App Builder** — a Docker container that is born knowing one thing: the app it was created to build. It inherits the company northstar, mounts company context read-only, and carries a pre-installed Claude Code instance with semi-autonomous permissions baked in. You run `./app-builder.sh onething plusone` and in 15 seconds you have a fully wired AI coding environment named `app-onething-plusone`, ready for `docker exec -it app-onething-plusone claude`.

4. **Guided onboarding** — `install.sh` is now a 4-step wizard with visual progress bars, glossary terms at each step (so the founder understands what Clark is, what an AIOO is, what a vault is — before they've even used it), and confirm-on-input so nothing gets mistyped. It runs in ~2 minutes and produces a live system.

5. **Standardized UI** — every script in Personal AI now uses the same visual language: `╔═══╗` banners, `[Step N/M]` progress bars with `█░` fill, `▸` cyan glossary bullets, and `${D}` dim text for explanations. Clark, AIOO, App Builder — same visual register.

---

### Why "App Builder" and Not "MVP Builder"

"MVP" is a product mindset word. It implies minimalism as a temporary compromise on the way to something real.

"App Builder" is an identity. It is a container that is named after the app it builds. It is the app's home. It grows with the app. It knows the company northstar. It is not a stepping stone — it is the place where the work happens.

The container `app-onething-plusone` is not a throwaway environment. It is `plusone`. It owns its workspace. It has a git remote. It commits. It pushes. It is a craftsman with a dedicated workshop.

This distinction matters because the system should think of itself clearly. When an AIOO spawns an App Builder, it is not spinning up a sandbox — it is hiring a specialist. Names carry that meaning.

---

### Access Control Model (enforced by mounts, not trust)

| Agent | Vault Access | Mode |
|-------|-------------|------|
| clark-{owner} | All companies: `Distilled/Clark/` | read-only |
| clark-{cofounder} | One company: `Distilled/Clark/` | read-only |
| aioo-{company} | `{company}/` full tree | read-write |
| app-{company}-{app} | `{company}/Distilled/` | read-only |
| content-loader | Full vault | read-write |

**The filesystem IS the access policy.** No auth tokens. No RBAC config. Docker mounts.

---

### What's Next

- `add-company.sh` — add a new company without re-running install
- Auto-generated `docker-compose.yml` from `config.json` — Clark and AIOO containers with correct vault mounts
- Mission Control wiring to new vault structure
- Co-founder Clark spawn flow (scoped PAT, separate container)

---

*Personal AI v0.2 — Do One Thing. Earn Full Autonomy.*
