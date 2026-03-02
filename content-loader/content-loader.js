'use strict';
const chokidar = require('chokidar');
const fs = require('fs');
const path = require('path');

const VAULT = process.env.VAULT_PATH || '/vault';
const RAW = path.join(VAULT, 'Raw');
const ARCHIVE = path.join(VAULT, 'Archive', 'Raw');
const DISTILL_CLARK = path.join(VAULT, 'Distilled', 'Clark');
const DISTILL_AIOO = path.join(VAULT, 'Distilled', 'AIOO');
const LOG_FILE = path.join(VAULT, 'Logs', 'content-loader.log');
const STUB_LIMIT = 500;

function log(msg) {
  const line = `${new Date().toISOString()} ${msg}\n`;
  fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });
  fs.appendFileSync(LOG_FILE, line);
  process.stdout.write(line);
}

function dateBucket() {
  return new Date().toISOString().slice(0, 13).replace('T', '-');
}

function archive(filePath) {
  const rel = path.relative(RAW, filePath);
  const dest = path.join(ARCHIVE, dateBucket(), rel);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(filePath, dest);
  log(`ARCHIVE ${rel} -> ${dest}`);
}

function distillStub(filePath) {
  const rel = path.relative(RAW, filePath);
  const raw = fs.readFileSync(filePath, 'utf8');
  const preview = raw.slice(0, STUB_LIMIT);
  const stub = `<!-- source: Raw/${rel} | ${new Date().toISOString()} -->\n${preview}\n\n[STUB - full distill pipeline TBD]\n`;
  for (const dir of [DISTILL_CLARK, DISTILL_AIOO]) {
    const dest = path.join(dir, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, stub);
    log(`DISTILL ${rel} -> ${dest}`);
  }
}

function onChange(filePath) {
  if (!filePath.endsWith('.md')) return;
  try { archive(filePath); distillStub(filePath); }
  catch (e) { log(`ERROR ${filePath}: ${e.message}`); }
}

// Ensure base directories exist
for (const d of [RAW, ARCHIVE, DISTILL_CLARK, DISTILL_AIOO]) {
  fs.mkdirSync(d, { recursive: true });
}

log('Content Loader started. Watching ' + RAW);
chokidar.watch(RAW, { ignoreInitial: false, persistent: true })
  .on('add', onChange)
  .on('change', onChange);
