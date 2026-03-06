'use strict';

const fs = require('fs');
const path = require('path');

function validatePayload(body, config) {
  if (!body || !body.entity) {
    return { valid: false, error: 'entity is required' };
  }
  if (!body.content || !body.content.trim()) {
    return { valid: false, error: 'content is required' };
  }
  const entityConfig = config.entities.find(e => e.name === body.entity);
  if (!entityConfig) {
    return { valid: false, error: `Entity '${body.entity}' not found`, status: 404 };
  }
  return { valid: true };
}

function writeToRaw(entity, title, content, vaultPath, subfolder) {
  let rawDir = path.join(vaultPath, entity, 'Raw');
  if (subfolder) {
    // Sanitize subfolder to prevent path traversal
    const safe = subfolder.replace(/\.\./g, '').replace(/[^a-zA-Z0-9/_-]/g, '');
    rawDir = path.join(rawDir, safe);
  }
  fs.mkdirSync(rawDir, { recursive: true });
  const safeName = (title || 'untitled')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .substring(0, 80);
  const ts = Date.now();
  const filename = `${safeName}-${ts}.md`;
  const filePath = path.join(rawDir, filename);
  fs.writeFileSync(filePath, content, 'utf8');
  return filePath;
}

function createIngestHandler(config, vaultPath) {
  return function handleIngest(req, res) {
    const validation = validatePayload(req.body, config);
    if (!validation.valid) {
      const status = validation.status || 400;
      return res.status(status).json({ error: validation.error });
    }
    const { entity, title, content, subfolder } = req.body;
    try {
      const filePath = writeToRaw(entity, title, content, vaultPath, subfolder);
      res.json({
        ok: true,
        queued_path: path.relative(vaultPath, filePath),
        entity,
        message: 'File written to Raw; chokidar will process it'
      });
    } catch (err) {
      res.status(500).json({ error: `Ingest failed: ${err.message}` });
    }
  };
}

module.exports = { validatePayload, writeToRaw, createIngestHandler };
