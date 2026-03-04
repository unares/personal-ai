'use strict';

const chokidar = require('chokidar');
const fs = require('fs');
const path = require('path');
const { classify, categoryToDir } = require('./classifier');
const { selfHeal, detectPredictions } = require('./self-heal');
const { detectConflicts } = require('./conflict');
const { generateFrontmatter, writeDistilled, sourceHash } = require('./frontmatter');
const { createApi } = require('./api');
const { initDb, indexFile, logConflict, logPrediction } = require('./db');
const { buildIndex } = require('./db-search');
const { startPostProcessor } = require('./post-process');
const { initDistillSchema } = require('./distill');
const { initStorySchema } = require('./story-blog');
const { initAccessSchema } = require('./access');
const cache = require('./cache');

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

function archiveRaw(filePath, entity) {
  const bucket = new Date().toISOString().substring(0, 13).replace('T', '-');
  const archiveDir = path.join(VAULT, entity, 'Archive', 'Raw', bucket);
  fs.mkdirSync(archiveDir, { recursive: true });
  const dest = path.join(archiveDir, path.basename(filePath));
  fs.copyFileSync(filePath, dest);
  return path.relative(VAULT, dest);
}

function processFile(filePath, entity) {
  if (!filePath.endsWith('.md')) return;

  const content = fs.readFileSync(filePath, 'utf8');
  if (!content.trim()) return;

  const relPath = path.relative(path.join(VAULT, entity, 'Raw'), filePath);
  const { content: healed, corrections } = selfHeal(content);
  const predictions = detectPredictions(healed);
  const classification = classify(healed);

  for (const cat of classification.all_detected) {
    const conflicts = detectConflicts(
      healed, categoryToDir(cat), entity, VAULT
    );
    const fm = generateFrontmatter({
      filePath: relPath, content, entity,
      classification: { ...classification, primary: cat },
      predictions, corrections, conflicts
    });
    const correctionComment = corrections.length > 0
      ? `\n<!-- Context Loader corrected [${new Date().toISOString()}]: ${corrections.join('; ')} -->\n`
      : '';
    const body = healed + correctionComment;
    const outPath = writeDistilled(
      fm, body, cat, entity, path.basename(filePath), VAULT
    );
    indexFile({
      entity, sourceFile: relPath, sourceHash: fm.sourceHash,
      category: categoryToDir(cat), distilledPath: outPath,
      trustScore: fm.trustScore, frontmatter: fm.yaml,
      bodyPreview: body.substring(0, 1500),
      meaningDensity: fm.meaningDensity, hypeScore: fm.hypeScore
    });
    for (const c of conflicts) {
      logConflict({
        entity, sourceFile: relPath, conflictType: c.type,
        existingClaim: c.existing_claim, newClaim: c.new_claim,
        existingFile: c.existing_file, recommendation: c.recommendation,
        confidence: c.confidence
      });
    }
    for (const p of predictions) {
      logPrediction({
        entity, sourceFile: relPath,
        predictionType: p.type, predictionText: p.text
      });
    }
    log(entity, `DISTILL ${relPath} -> ${outPath}`);
  }

  cache.invalidate(entity);
  const archivePath = archiveRaw(filePath, entity);
  log(entity, `ARCHIVE ${relPath} -> ${archivePath}`);

  const extras = [];
  if (predictions.length > 0) extras.push(`${predictions.length} prediction(s)`);
  if (corrections.length > 0) extras.push(`${corrections.length} correction(s)`);
  const suffix = extras.length > 0 ? ` | ${extras.join(', ')}` : '';
  log(entity, `Processed ${relPath} -> ${classification.all_detected.map(categoryToDir).join(', ')}${suffix}`);
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
  initDb(VAULT);
  initDistillSchema();
  initStorySchema();
  initAccessSchema();
  const entityNames = CONFIG.entities.map(e => e.name);
  buildIndex(VAULT, entityNames);
  startWatchers();
  startPostProcessor(entityNames, 30000);
  cache.startCompactionSchedule();
  const app = createApi(CONFIG, VAULT);
  app.listen(PORT, () => {
    console.log(`Context Loader v0.2 listening on port ${PORT}`); // v0.2 Phase 4
  });
}

main();
