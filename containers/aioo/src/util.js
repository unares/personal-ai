'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

function atomicWriteJson(filePath, data) {
  const dir = path.dirname(filePath);
  const tmp = path.join(dir, `.tmp-${crypto.randomUUID()}.json`);
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n');
  fs.renameSync(tmp, filePath);
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

module.exports = { atomicWriteJson, ensureDir };
