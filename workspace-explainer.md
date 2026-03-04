## What is `/workspace`?

It's a directory **inside a Docker container**. Think of a container like a sealed room — it has its own filesystem, its own processes, and by default can't see anything outside itself. `/workspace` is just the working folder inside that room.

```
Your computer (the host)
│
├── ~/personal-ai/              ← your actual files on disk
│   ├── memory-vault/
│   ├── install.sh
│   ├── clark.sh
│   └── ...
│
└── Docker containers (sealed rooms)
    ├── app-builder-onething-context-extractor/
    │   └── /workspace/         ← THIS container's workspace
    │       ├── context-extractor.js
    │       ├── api.js
    │       └── ...
    ├── clark-michal/
    │   └── /vault/             ← clark uses /vault, not /workspace
    └── aioo-onething/
        └── /vault/
```

---

## Who can see `/workspace`?

Here's every component in Personal AI and what it can access — based on the actual `docker run` commands in your code:

```
┌──────────────────────────────────────────────────────────────────────┐
│ Component         │ /workspace │ /vault (Distilled) │ /vault (Raw) │
├──────────────────────────────────────────────────────────────────────┤
│ App Builder       │ ✅ OWNS IT │ ✅ read-only        │ ❌ no        │
│ Clark             │ ❌ no      │ ✅ read-only        │ ❌ no        │
│ AIOO              │ ❌ no      │ ✅ read-write       │ ✅ full      │
│ Context Extractor    │ ❌ no      │ ✅ writes to it     │ ✅ reads it  │
│ [removed]   │ ❌ no      │ ❌ no               │ ❌ no        │
└──────────────────────────────────────────────────────────────────────┘
```

---

## Why each one has what it has

**App Builder** gets `/workspace` exclusively because it's building software. It needs read+write access to its own code, but only read-only access to the entity's distilled context (so it understands what it's building for, but can't corrupt the vault).

**Clark** (philosophical brain) is the most restricted — read-only on distilled context only. It advises, never writes.

**AIOO** (operations officer) can write to the vault because it's responsible for distilling and organizing knowledge. It's the vault's steward.

**Context Extractor** reads Raw notes and writes Distilled output. It never touches `/workspace` — it doesn't know or care about the app code.

**[removed]** is deliberately isolated — it only sees `shared/` (the SQLite database and northstar summaries). It can't reach into any container's workspace or any entity's vault.

---

## The key mental model

Think of it like an office building:

| Space | Analogy |
|---|---|
| `/workspace` | A builder's private workshop — only they have the key |
| `/vault/Distilled` | The shared library — most people can read, few can write |
| `/vault/Raw` | The inbox — only the archivist (AIOO/Context Extractor) touches it |
| `shared/` | The noticeboard — public within the building |

Containers can only see what was explicitly handed to them via `-v` (volume mount) when they were started. No volume mount = completely invisible. That's the security model.
