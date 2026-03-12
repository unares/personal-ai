'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { validateEnvelope } = require('./envelope');

function readMessages(dir) {
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
  const results = [];
  for (const file of files) {
    const filePath = path.join(dir, file);
    try {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      if (!validateEnvelope(data)) {
        console.error(`[ipc] Invalid envelope: ${file}`);
        processMessage(dir, file);
        continue;
      }
      results.push({ envelope: data, file });
    } catch (err) {
      console.error(`[ipc] Parse error in ${file}: ${err.message}`);
      processMessage(dir, file);
    }
  }
  return results.sort((a, b) => a.envelope.timestamp.localeCompare(b.envelope.timestamp));
}

function processMessage(dir, file) {
  const processedDir = path.join(dir, 'processed');
  fs.mkdirSync(processedDir, { recursive: true });
  fs.renameSync(path.join(dir, file), path.join(processedDir, file));
}

module.exports = { readMessages, processMessage };
