'use strict';

const chokidar = require('chokidar');
const fs = require('fs');
const path = require('path');
const { classify, categoryToDir } = require('./classifier');
const { selfHeal } = require('./self-heal');
const { createSimpleApi } = require('./api-simple');
const { initSimpleDb, indexFileSimple } = require('./db-simple');
const chronicle = require('./chronicle');

const VAULT = process.env.VAULT_PATH || '/vault';
const PORT = process.env.CL_PORT || 27125;
const CONFIG_PATH = process.env.CONFIG_PATH || path.join(__dirname, 'config.json');
const CONFIG = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));

function log(entity, message) {
  const logDir = path.join(VAULT, entity, 'Logs');
  fs.mkdirSync(logDir, { recursive: true });
  const line = `[${new Date().toISOString()}] ${message}\n`;
  fs.appendFileSync(path.join(logDir, 'context-extractor.log'), line);
  console.log(`[${entity}] ${message}`);
}

function writeDistilledSimple(content, cat, entity, fileName) {
  const dirName = categoryToDir(cat);
  const outDir = path.join(VAULT, entity, 'Distilled', dirName);
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, fileName);
  const hash = require('crypto').createHash('sha256')
    .update(content).digest('hex').substring(0, 16);
  const yaml = `---\ncategory: ${dirName}\nentity: ${entity}\nsource_hash: ${hash}\nprocessed_date: ${new Date().toISOString()}\nsource_file: ${fileName}\n---`;
  fs.writeFileSync(outPath, `${yaml}\n\n${content.substring(0, 1500)}`);
  return path.relative(VAULT, outPath);
}

function moveTobin(filePath, entity) {
  const bucket = new Date().toISOString().substring(0, 13).replace('T', '-');
  const binDir = path.join(VAULT, entity, 'Bin', 'processed', bucket);
  fs.mkdirSync(binDir, { recursive: true });
  const dest = path.join(binDir, path.basename(filePath));
  fs.copyFileSync(filePath, dest);
  fs.unlinkSync(filePath);
  return path.relative(VAULT, dest);
}

function processFile(filePath, entity) {
  if (!filePath.endsWith('.md')) return;
  const content = fs.readFileSync(filePath, 'utf8');
  if (!content.trim()) return;

  const jobId = chronicle.generateJobId('context-extractor', entity);
  chronicle.fileCreated(VAULT, entity, filePath, {
    jobId, agent: 'context-extractor', source: 'raw-watcher'
  });

  const relPath = path.relative(path.join(VAULT, entity, 'Raw'), filePath);
  const { content: healed } = selfHeal(content);
  const classification = classify(healed);

  for (const cat of classification.all_detected) {
    const outPath = writeDistilledSimple(
      healed, cat, entity, path.basename(filePath)
    );
    indexFileSimple({
      entity, sourceFile: relPath,
      sourceHash: require('crypto').createHash('sha256')
        .update(content).digest('hex').substring(0, 16),
      category: categoryToDir(cat), distilledPath: outPath,
      trustScore: 0.7, bodyPreview: healed.substring(0, 1500)
    });
    log(entity, `DISTILL ${relPath} -> ${outPath}`);
  }

  const binPath = moveTobin(filePath, entity);
  log(entity, `BIN ${relPath} -> ${binPath}`);
  log(entity, `Processed ${relPath} -> ${classification.all_detected.map(categoryToDir).join(', ')}`);
}

function startWatchers() {
  for (const entity of CONFIG.entities) {
    const rawPath = path.join(VAULT, entity.name, 'Raw');
    fs.mkdirSync(rawPath, { recursive: true });
    const watcher = chokidar.watch(rawPath, {
      ignoreInitial: true,
      awaitWriteFinish: { stabilityThreshold: 500 }
    });
    watcher
      .on('add', (fp) => processFile(fp, entity.name))
      .on('change', (fp) => processFile(fp, entity.name))
      .on('error', (e) => log(entity.name, `WATCHER ERROR: ${e.message}`));
    log(entity.name, `Watching ${rawPath}`);
  }
}

function main() {
  initSimpleDb(VAULT);
  const entityNames = CONFIG.entities.map(e => e.name);
  startWatchers();
  const app = createSimpleApi(CONFIG, VAULT);
  app.listen(PORT, () => {
    console.log(`Context Extractor v0.4 (simple mode) listening on port ${PORT}`);
  });
}

main();
