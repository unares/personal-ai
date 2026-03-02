'use strict';
const chokidar = require('chokidar');
const fs = require('fs');
const path = require('path');

const VAULT = process.env.VAULT_PATH || '/vault';
const CONFIG_PATH = process.env.CONFIG_PATH || '/app/config.json';
const LOG_FILE = path.join(VAULT, 'Logs', 'content-loader.log');
const STUB_LIMIT = 500;

function log(company, msg, companyLogFile) {
  const line = `${new Date().toISOString()} [${company}] ${msg}\n`;
  fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });
  fs.appendFileSync(LOG_FILE, line);
  if (companyLogFile) {
    fs.mkdirSync(path.dirname(companyLogFile), { recursive: true });
    fs.appendFileSync(companyLogFile, line);
  }
  process.stdout.write(line);
}

function dateBucket() {
  return new Date().toISOString().slice(0, 13).replace('T', '-');
}

function watchProject(project) {
  const name = project.name;
  const rawDir    = path.join(VAULT, name, 'Raw');
  const archDir   = path.join(VAULT, name, 'Archive', 'Raw');
  const clarkDir  = path.join(VAULT, name, 'Distilled', 'Clark');
  const aiooDir   = path.join(VAULT, name, 'Distilled', 'AIOO');
  const coLog     = path.join(VAULT, name, 'Logs', 'content-loader.log');

  for (const d of [rawDir, archDir, clarkDir, aiooDir, path.join(VAULT, name, 'Logs')]) {
    fs.mkdirSync(d, { recursive: true });
  }

  function onChange(filePath) {
    if (!filePath.endsWith('.md')) return;
    try {
      const rel    = path.relative(rawDir, filePath);
      const bucket = path.join(archDir, dateBucket(), rel);
      fs.mkdirSync(path.dirname(bucket), { recursive: true });
      fs.copyFileSync(filePath, bucket);
      log(name, `ARCHIVE ${rel}`, coLog);

      const raw  = fs.readFileSync(filePath, 'utf8');
      const stub = `<!-- source: ${name}/Raw/${rel} | ${new Date().toISOString()} -->\n${raw.slice(0, STUB_LIMIT)}\n\n[STUB - full distill pipeline TBD]\n`;

      for (const dir of [clarkDir, aiooDir]) {
        const dest = path.join(dir, rel);
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.writeFileSync(dest, stub);
        log(name, `DISTILL ${rel} -> ${path.relative(VAULT, dest)}`, coLog);
      }
    } catch (e) {
      log(name, `ERROR ${filePath}: ${e.message}`, coLog);
    }
  }

  log(name, `Watching ${rawDir}`, coLog);
  chokidar.watch(rawDir, { ignoreInitial: false, persistent: true })
    .on('add', onChange)
    .on('change', onChange);
}

// Load config and start watchers
let config;
try {
  config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
} catch (e) {
  console.error(`Content Loader: cannot read config at ${CONFIG_PATH}: ${e.message}`);
  process.exit(1);
}

fs.mkdirSync(path.join(VAULT, 'Logs'), { recursive: true });
log('system', `Content Loader started — ${config.projects.length} companies`);

for (const project of config.projects) {
  watchProject(project);
}
