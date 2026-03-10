'use strict';

const chokidar = require('chokidar');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const {
  categoryToDir,
  parseSections,
  buildHumanPatterns,
  buildEntityPatterns,
  detectEntities,
  classifySections
} = require('./classifier');
const { selfHeal } = require('./self-heal');
const { createSimpleApi } = require('./api-simple');
const { initSimpleDb, indexFileSimple } = require('./db-simple');
const { startBinAuditSchedule } = require('./bin-purge');

const VAULT = process.env.VAULT_PATH || '/vault';
const PORT = process.env.CL_PORT || 27125;
const CONFIG_PATH = process.env.CONFIG_PATH || path.join(__dirname, 'config.json');
const CONFIG = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));

// Build patterns once at startup from config
const HUMAN_PATTERNS = buildHumanPatterns(CONFIG);
const ENTITY_PATTERNS = buildEntityPatterns(CONFIG);

const RAW_RETENTION_MS = 60 * 24 * 60 * 60 * 1000; // 60 days

function log(entity, message) {
  const logDir = path.join(VAULT, entity, 'Logs');
  fs.mkdirSync(logDir, { recursive: true });
  const line = `[${new Date().toISOString()}] ${message}\n`;
  fs.appendFileSync(path.join(logDir, 'context-extractor.log'), line);
  console.log(`[${entity}] ${message}`);
}

// --- Retention: mark as distilled, keep in Raw for 60 days, then move to Bin ---

/**
 * Mark a Raw file as distilled with a sidecar .distilled.json.
 * File stays in Raw for 60 days before moving to Bin.
 */
function markAsDistilled(filePath, entity, categories, entities) {
  const sidecarPath = filePath + '.distilled.json';
  const meta = {
    distilled_at: new Date().toISOString(),
    categories: categories.map(categoryToDir),
    entities,
    entity_origin: entity
  };
  fs.writeFileSync(sidecarPath, JSON.stringify(meta, null, 2));
  return sidecarPath;
}

/**
 * Check if a Raw file has already been distilled.
 */
function isAlreadyDistilled(filePath) {
  return fs.existsSync(filePath + '.distilled.json');
}

/**
 * Sweep Raw dirs: move files older than 60 days (since distillation) to Bin.
 * Runs on startup and daily. Never deletes — only moves.
 */
function retentionSweep() {
  const now = Date.now();
  for (const entity of CONFIG.entities) {
    const rawPath = path.join(VAULT, entity.name, 'Raw');
    if (!fs.existsSync(rawPath)) continue;
    sweepDir(rawPath, entity.name, now);
  }
}

function sweepDir(dirPath, entity, now) {
  let entries;
  try { entries = fs.readdirSync(dirPath, { withFileTypes: true }); }
  catch { return; }

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      sweepDir(fullPath, entity, now);
      continue;
    }
    if (!entry.name.endsWith('.distilled.json')) continue;

    // Found a sidecar — check age
    try {
      const meta = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
      const age = now - new Date(meta.distilled_at).getTime();
      if (age >= RAW_RETENTION_MS) {
        const mdPath = fullPath.replace('.distilled.json', '');
        moveToBin(mdPath, fullPath, entity);
      }
    } catch (e) {
      console.log(`[retention] Error reading ${fullPath}: ${e.message}`);
    }
  }
}

function moveToBin(mdPath, sidecarPath, entity) {
  const bucket = new Date().toISOString().substring(0, 10); // YYYY-MM-DD
  const binDir = path.join(VAULT, entity, 'Bin', 'retained', bucket);
  fs.mkdirSync(binDir, { recursive: true });

  if (fs.existsSync(mdPath)) {
    fs.copyFileSync(mdPath, path.join(binDir, path.basename(mdPath)));
    fs.unlinkSync(mdPath);
  }
  if (fs.existsSync(sidecarPath)) {
    fs.copyFileSync(sidecarPath, path.join(binDir, path.basename(sidecarPath)));
    fs.unlinkSync(sidecarPath);
  }
  log(entity, `RETENTION ${path.basename(mdPath)} -> Bin/retained/${bucket}/ (60-day move)`);
}

// --- QuickScan ---

function generateQuickScan(categoryMap, fileName, entity) {
  const lines = [];
  lines.push(`Source: ${fileName}`);
  lines.push(`Entity: ${entity}`);

  const activeCats = Object.entries(categoryMap)
    .filter(([, sections]) => sections.length > 0)
    .map(([cat]) => categoryToDir(cat));
  lines.push(`Categories: ${activeCats.join(', ')}`);
  lines.push('');

  for (const [cat, sections] of Object.entries(categoryMap)) {
    if (sections.length === 0) continue;
    const dirName = categoryToDir(cat);
    const headers = sections
      .map(s => s.header || '(preamble)')
      .join(', ');
    lines.push(`${dirName}: ${sections.length} section(s) — ${headers}`);
  }

  return lines.join('\n');
}

// --- Distilled file writing ---

function writeDistilledSimple(sections, cat, entity, fileName, quickScan) {
  const dirName = categoryToDir(cat);
  const outDir = path.join(VAULT, entity, 'Distilled', dirName);
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, fileName);

  const body = sections
    .map(s => s.content)
    .join('\n\n');

  const hash = crypto.createHash('sha256')
    .update(body).digest('hex').substring(0, 16);

  const yaml = [
    '---',
    `category: ${dirName}`,
    `entity: ${entity}`,
    `source_hash: ${hash}`,
    `processed_date: ${new Date().toISOString()}`,
    `source_file: ${fileName}`,
    `section_count: ${sections.length}`,
    '---'
  ].join('\n');

  const fileContent = `${yaml}\n\n${quickScan}\n\n---\n\n${body}`;
  fs.writeFileSync(outPath, fileContent);

  return {
    relPath: path.relative(VAULT, outPath),
    body
  };
}

// --- Multi-entity section routing ---

/**
 * Build entity→category→sections map.
 * Primary entity gets ALL sections (classified by category).
 * Secondary entities get only sections that mention them.
 */
function buildEntityCategoryMap(sections, primaryEntity) {
  // First, classify all sections into categories
  const categoryMap = classifySections(sections, HUMAN_PATTERNS);

  // Primary entity gets the full categoryMap
  const entityMap = {};
  entityMap[primaryEntity] = categoryMap;

  // For each section, detect secondary entities
  for (const section of sections) {
    const entities = detectEntities(section.content, ENTITY_PATTERNS, primaryEntity);
    for (const ent of entities) {
      if (ent === primaryEntity) continue;

      // Initialize this entity's map if first time
      if (!entityMap[ent]) {
        entityMap[ent] = { personal_story: [], shared_story: [], specification: [] };
      }

      // Find which categories this section belongs to
      for (const [cat, catSections] of Object.entries(categoryMap)) {
        if (catSections.includes(section)) {
          entityMap[ent][cat].push(section);
        }
      }
    }
  }

  return entityMap;
}

// --- Main processing ---

function processFile(filePath, primaryEntity) {
  if (!filePath.endsWith('.md')) return;
  // Skip sidecar files
  if (filePath.endsWith('.distilled.json')) return;
  // Skip already-distilled files
  if (isAlreadyDistilled(filePath)) return;

  const content = fs.readFileSync(filePath, 'utf8');
  if (!content.trim()) return;

  const relPath = path.relative(path.join(VAULT, primaryEntity, 'Raw'), filePath);
  const { content: healed } = selfHeal(content);
  const sourceHash = crypto.createHash('sha256')
    .update(content).digest('hex').substring(0, 16);
  const fileName = path.basename(filePath);

  // Section-level routing with multi-entity support
  const sections = parseSections(healed);
  const entityMap = buildEntityCategoryMap(sections, primaryEntity);
  const allEntities = Object.keys(entityMap);

  for (const [entity, categoryMap] of Object.entries(entityMap)) {
    const quickScan = generateQuickScan(categoryMap, fileName, entity);

    for (const [cat, catSections] of Object.entries(categoryMap)) {
      if (catSections.length === 0) continue;

      const { relPath: outPath, body } = writeDistilledSimple(
        catSections, cat, entity, fileName, quickScan
      );

      indexFileSimple({
        entity,
        sourceFile: relPath,
        sourceHash,
        category: categoryToDir(cat),
        distilledPath: outPath,
        trustScore: 0.7,
        bodyPreview: body.substring(0, 1500)
      });

      log(entity, `DISTILL ${relPath} -> ${outPath} (${catSections.length} sections)`);
    }

    const activeCats = Object.entries(categoryMap)
      .filter(([, s]) => s.length > 0)
      .map(([c]) => categoryToDir(c));
    log(entity, `Processed ${relPath} -> ${activeCats.join(', ')}`);
  }

  // Mark as distilled — file stays in Raw for 60 days
  const activeCats = [];
  for (const categoryMap of Object.values(entityMap)) {
    for (const [cat, secs] of Object.entries(categoryMap)) {
      if (secs.length > 0 && !activeCats.includes(cat)) activeCats.push(cat);
    }
  }
  markAsDistilled(filePath, primaryEntity, activeCats, allEntities);
  log(primaryEntity, `MARKED ${relPath} as distilled (retained in Raw for 60 days)`);
}

function startWatchers() {
  for (const entity of CONFIG.entities) {
    const rawPath = path.join(VAULT, entity.name, 'Raw');
    fs.mkdirSync(rawPath, { recursive: true });
    const watcher = chokidar.watch(rawPath, {
      ignoreInitial: true,
      ignored: /\.distilled\.json$/,
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

  // Retention sweep: move 60-day-old distilled files from Raw to Bin
  retentionSweep();
  setInterval(retentionSweep, 24 * 60 * 60 * 1000); // daily

  // Bin audit: log contents, never auto-delete
  const entityNames = CONFIG.entities.map(e => e.name);
  startBinAuditSchedule(VAULT, entityNames);

  startWatchers();
  const app = createSimpleApi(CONFIG, VAULT);
  app.listen(PORT, () => {
    console.log(`Context Extractor v0.4 (simple mode) listening on port ${PORT}`);
    console.log(`Human patterns: ${HUMAN_PATTERNS.length}, Entity patterns: ${Object.keys(ENTITY_PATTERNS).length}`);
  });
}

main();
