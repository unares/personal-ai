'use strict';
const express    = require('express');
const cors       = require('cors');
const { execSync } = require('child_process');
const fs         = require('fs');
const path       = require('path');
const Database   = require('better-sqlite3');

const app          = express();
const PORT         = process.env.PORT         || 3000;
const HOST         = '0.0.0.0';
const DB_PATH      = process.env.DB_PATH      || '/app/shared/chronicle.db';
const TEMPLATES_DIR = process.env.TEMPLATES_DIR || '/app/templates';
const NORTHSTAR_DIR = process.env.NORTHSTAR_DIR || '/app/shared/northstar-summaries';

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ─── DB ────────────────────────────────────────────────────────────────────

let db;
function getDb() {
  if (db) return db;
  db = new Database(DB_PATH);
  return db;
}

// ─── Helpers ───────────────────────────────────────────────────────────────

const VALID_ROLES = ['clark', 'aioo', 'mvp-builder'];

function sanitize(str) {
  return String(str).replace(/[^a-z0-9-]/gi, '').slice(0, 64);
}

// ─── API: Sandboxes ────────────────────────────────────────────────────────

// GET /api/sandboxes
app.get('/api/sandboxes', (req, res) => {
  try {
    const rows = getDb().prepare(
      'SELECT * FROM sandboxes ORDER BY created_at DESC'
    ).all();
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/spawn  { role, name, project }
app.post('/api/spawn', (req, res) => {
  const role    = sanitize(req.body.role    || '');
  const name    = sanitize(req.body.name    || '');
  const project = sanitize(req.body.project || 'personal-ai');

  if (!VALID_ROLES.includes(role)) {
    return res.status(400).json({ error: `Invalid role. Valid: ${VALID_ROLES.join(', ')}` });
  }
  if (!name) {
    return res.status(400).json({ error: 'name is required' });
  }

  const id = `${role}-${name}`;

  try {
    // Bake template → instance
    const bakeScript = path.join(__dirname, '..', '..', 'bake-template.sh');
    if (fs.existsSync(bakeScript)) {
      execSync(`bash ${bakeScript} ${role} ${name} ${project}`, { stdio: 'pipe' });
    }

    // Record in chronicle
    getDb().prepare(
      'INSERT OR REPLACE INTO sandboxes (id, name, role, project_id, status) VALUES (?,?,?,?,?)'
    ).run(id, name, role, project, 'running');

    // Log spawn event
    getDb().prepare(
      'INSERT INTO events (project_id, sandbox_id, event_type, content) VALUES (?,?,?,?)'
    ).run(project, id, 'spawn', `Spawned ${role} "${name}" for project ${project}`);

    res.json({ ok: true, id });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/stop/:id
app.post('/api/stop/:id', (req, res) => {
  const id = sanitize(req.params.id);
  try {
    try { execSync(`docker stop ${id}`, { stdio: 'pipe' }); } catch (_) {}
    getDb().prepare(
      'UPDATE sandboxes SET status = ? WHERE id = ?'
    ).run('stopped', id);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── API: Events (activity feed) ───────────────────────────────────────────

// GET /api/events?project=personal-ai&limit=20
app.get('/api/events', (req, res) => {
  const project = sanitize(req.query.project || '');
  const limit   = Math.min(parseInt(req.query.limit, 10) || 20, 100);
  try {
    const query = project
      ? 'SELECT * FROM events WHERE project_id = ? ORDER BY created_at DESC LIMIT ?'
      : 'SELECT * FROM events ORDER BY created_at DESC LIMIT ?';
    const rows = project
      ? getDb().prepare(query).all(project, limit)
      : getDb().prepare(query).all(limit);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── API: Northstar ────────────────────────────────────────────────────────

// GET /api/northstar/:project
app.get('/api/northstar/:project', (req, res) => {
  const project = sanitize(req.params.project);
  const file = path.join(NORTHSTAR_DIR, `${project}.md`);
  if (fs.existsSync(file)) {
    res.type('text/plain').send(fs.readFileSync(file, 'utf8'));
  } else {
    res.status(404).json({ error: 'Northstar not found' });
  }
});

// ─── API: Cost summary per sandbox ─────────────────────────────────────────

// GET /api/costs
app.get('/api/costs', (req, res) => {
  try {
    const rows = getDb().prepare(`
      SELECT sandbox_id, SUM(cost_usd) as total_cost, COUNT(*) as event_count,
             MAX(created_at) as last_event
      FROM events GROUP BY sandbox_id
    `).all();
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Start ─────────────────────────────────────────────────────────────────

app.listen(PORT, HOST, () => {
  console.log(`Mission Control listening on ${HOST}:${PORT}`);
});
