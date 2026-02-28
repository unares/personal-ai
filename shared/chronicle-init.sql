PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS sandboxes (
 id          TEXT PRIMARY KEY,
 name        TEXT NOT NULL,
 role        TEXT NOT NULL CHECK(role IN ('clark','aioo','mvp-builder','mission-control')),
 project_id  TEXT NOT NULL,
 status      TEXT NOT NULL DEFAULT 'running',
 created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS events (
 id          INTEGER PRIMARY KEY AUTOINCREMENT,
 project_id  TEXT NOT NULL,
 sandbox_id  TEXT NOT NULL REFERENCES sandboxes(id),
 event_type  TEXT NOT NULL,
 content     TEXT NOT NULL,
 cost_usd    REAL DEFAULT 0,
 tokens_used INTEGER DEFAULT 0,
 metadata    TEXT,
 created_at  TEXT NOT NULL DEFAULT (datetime('now')),
 synced      INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS northstar_summaries (
 id          INTEGER PRIMARY KEY AUTOINCREMENT,
 project_id  TEXT NOT NULL UNIQUE,
 content     TEXT NOT NULL,
 updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE VIRTUAL TABLE IF NOT EXISTS events_fts USING fts5(
 content,
 project_id UNINDEXED,
 event_type UNINDEXED,
 content=events,
 content_rowid=id
);

CREATE TRIGGER IF NOT EXISTS events_ai AFTER INSERT ON events 
BEGIN
  INSERT INTO events_fts(rowid, content) VALUES (new.id, new.content);
END;

INSERT OR IGNORE INTO northstar_summaries (project_id, content) 
VALUES 
  ('personal-ai', '# Personal AI\nBuild the ultimate Personal AI.'),
  ('procenteo', '# Procenteo\nNorthstar TBD.'),
  ('inisio', '# Inisio\nNorthstar TBD.');
