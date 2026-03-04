  'use strict';
  const express  = require('express');
  const cors     = require('cors');
  const fs       = require('fs');
  const path     = require('path');
  const Database = require('better-sqlite3');

  const app  = express();
  const PORT = 3000;
  const DB_PATH       = process.env.DB_PATH       || '/app/shared/chronicle.db';
  const NORTHSTAR_DIR = process.env.NORTHSTAR_DIR || '/app/shared/northstar-summaries';

  app.use(cors());
  app.use(express.json());
  app.use(express.static(path.join(__dirname, 'public')));

  let db;
  function getDb() {
    if (db) return db;
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
    db = new Database(DB_PATH);
    db.exec(`
      PRAGMA journal_mode=WAL;
      CREATE TABLE IF NOT EXISTS sandboxes (
        id TEXT PRIMARY KEY, name TEXT, role TEXT, project_id TEXT,
        status TEXT DEFAULT 'running', created_at TEXT DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS events (
        id INTEGER PRIMARY KEY AUTOINCREMENT, project_id TEXT, sandbox_id TEXT,
        event_type TEXT, content TEXT, cost_usd REAL DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now'))
      );
    `);
    return db;
  }

  const sanitize = s => String(s).replace(/[^a-z0-9-]/gi,'').slice(0,64);
  const VALID = ['clark','aioo','mvp-builder'];

  app.get('/api/sandboxes', (req, res) => {
    try { res.json(getDb().prepare('SELECT * FROM sandboxes ORDER BY created_at DESC').all()); }
    catch(e) { res.status(500).json({error:e.message}); }
  });

  app.post('/api/spawn', (req, res) => {
    const role    = sanitize(req.body.role    || '');
    const name    = sanitize(req.body.name    || '');
    const project = sanitize(req.body.project || 'personal-ai');
    if (!VALID.includes(role)) return res.status(400).json({error:'Invalid role'});
    if (!name) return res.status(400).json({error:'name required'});
    const id = `${role}-${name}`;
    try {
      getDb().prepare(
        'INSERT OR REPLACE INTO sandboxes (id,name,role,project_id,status) VALUES (?,?,?,?,?)'
      ).run(id, name, role, project, 'running');
      getDb().prepare(
        'INSERT INTO events (project_id,sandbox_id,event_type,content) VALUES (?,?,?,?)'
      ).run(project, id, 'spawn', `Spawned ${role} "${name}" for ${project}`);
      res.json({ok:true, id});
    } catch(e) { res.status(500).json({error:e.message}); }
  });

  app.post('/api/stop/:id', (req, res) => {
    const id = sanitize(req.params.id);
    try {
      getDb().prepare('UPDATE sandboxes SET status=? WHERE id=?').run('stopped', id);
      res.json({ok:true});
    } catch(e) { res.status(500).json({error:e.message}); }
  });

  app.get('/api/events', (req, res) => {
    const project = sanitize(req.query.project || '');
    const limit   = Math.min(parseInt(req.query.limit,10)||20, 100);
    try {
      const rows = project
        ? getDb().prepare('SELECT * FROM events WHERE project_id=? ORDER BY created_at DESC LIMIT ?').all(project, limit)
        : getDb().prepare('SELECT * FROM events ORDER BY created_at DESC LIMIT ?').all(limit);
      res.json(rows);
    } catch(e) { res.status(500).json({error:e.message}); }
  });

  app.get('/api/northstar/:project', (req, res) => {
    const p    = sanitize(req.params.project);
    const file = path.join(NORTHSTAR_DIR, `${p}.md`);
    if (fs.existsSync(file)) return res.type('text/plain').send(fs.readFileSync(file,'utf8'));
    res.status(404).json({error:'not found'});
  });

  app.get('/api/costs', (req, res) => {
    try {
      res.json(getDb().prepare(
        'SELECT sandbox_id, SUM(cost_usd) as total_cost, COUNT(*) as event_count FROM events GROUP BY sandbox_id'
      ).all());
    } catch(e) { res.status(500).json({error:e.message}); }
  });

  app.listen(PORT, '0.0.0.0', () => console.log(`Mission Control → http://localhost:${PORT}`));
