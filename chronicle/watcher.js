'use strict';

const chokidar = require('chokidar');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

const VAULT = process.env.VAULT_PATH || '/vault';
const CONFIG_PATH = process.env.CONFIG_PATH || '/app/config.json';

// --- Audit event functions (moved from context-extractor/chronicle.js) ---

const MAX_LOG_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_ROTATED = 3;

function generateJobId(agent, entity) {
  const ts = new Date().toISOString().replace(/[-:]/g, '').substring(0, 15);
  const hash = crypto.randomBytes(2).toString('hex');
  return `${agent}-${entity}-${ts}-${hash}`;
}

function rotateIfNeeded(logPath) {
  try {
    const stat = fs.statSync(logPath);
    if (stat.size < MAX_LOG_SIZE) return;
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const rotated = logPath.replace('.jsonl', `-${ts}.jsonl`);
    fs.renameSync(logPath, rotated);
    const dir = path.dirname(logPath);
    const files = fs.readdirSync(dir)
      .filter(f => f.startsWith('chronicle-') && f.endsWith('.jsonl'))
      .sort().reverse();
    for (const old of files.slice(MAX_ROTATED)) {
      fs.unlinkSync(path.join(dir, old));
    }
  } catch (e) {
    if (e.code !== 'ENOENT') console.error('Rotation error:', e.message);
  }
}

function emitEvent(entity, event) {
  const logDir = path.join(VAULT, entity, 'Logs');
  fs.mkdirSync(logDir, { recursive: true });
  const logPath = path.join(logDir, 'chronicle.jsonl');
  rotateIfNeeded(logPath);
  const record = { timestamp: new Date().toISOString(), ...event };
  fs.appendFileSync(logPath, JSON.stringify(record) + '\n');
}

// --- Entity detection from file path ---

function entityFromPath(filePath) {
  const rel = path.relative(VAULT, filePath);
  return rel.split(path.sep)[0] || null;
}

// --- QMD helpers ---

function qmdSetup(entities) {
  for (const name of entities) {
    const entityDir = path.join(VAULT, name);
    if (!fs.existsSync(entityDir)) continue;
    try {
      execSync(
        `qmd collection add "${entityDir}" --name "${name}" --mask "**/*.md"`,
        { stdio: 'pipe' }
      );
      console.log(`[qmd] Collection added: ${name}`);
    } catch (e) {
      // Collection may already exist
      console.log(`[qmd] Collection ${name}: ${e.stderr?.toString().trim() || 'already exists'}`);
    }
  }
  try {
    console.log('[qmd] Building initial index...');
    execSync('qmd embed', { stdio: 'inherit', timeout: 300000 });
    console.log('[qmd] Initial index built');
  } catch (e) {
    console.error('[qmd] Initial embed failed:', e.message);
  }
}

function qmdReindex() {
  try {
    execSync('qmd embed', { stdio: 'pipe', timeout: 60000 });
  } catch (e) {
    console.error('[qmd] Reindex error:', e.message);
  }
}

// --- Watcher ---

function startWatcher(entities) {
  const watcher = chokidar.watch(VAULT, {
    ignored: [/(^|[\/\\])\../, /\.jsonl$/, /node_modules/],
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 500 }
  });

  const fileEvent = (type) => (filePath) => {
    if (!filePath.endsWith('.md')) return;
    const entity = entityFromPath(filePath);
    if (!entity || !entities.includes(entity)) return;
    const rel = path.relative(path.join(VAULT, entity), filePath);
    const jobId = generateJobId('chronicle', entity);

    emitEvent(entity, {
      event_type: type,
      entity,
      path: rel,
      job_id: jobId,
      agent: 'chronicle',
      metadata: { source: 'vault-watcher' }
    });
    console.log(`[${entity}] ${type} ${rel}`);
    qmdReindex();
  };

  watcher
    .on('add', fileEvent('FILE_CREATED'))
    .on('change', fileEvent('FILE_MODIFIED'))
    .on('unlink', fileEvent('FILE_DELETED'))
    .on('error', (e) => console.error('[watcher] Error:', e.message));

  console.log(`[chronicle] Watching ${VAULT} for .md changes`);
}

// --- Main ---

function main() {
  const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  const entities = config.entities.map(e => e.name);
  console.log(`[chronicle] Entities: ${entities.join(', ')}`);

  qmdSetup(entities);
  startWatcher(entities);
}

main();
