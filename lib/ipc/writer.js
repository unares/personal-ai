'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { validateEnvelope } = require('./envelope');

function writeMessage(dir, envelope) {
  if (!validateEnvelope(envelope)) {
    throw new Error('Invalid envelope: missing required fields');
  }
  const filename = `msg-${envelope.id}.json`;
  const tmpPath = path.join(dir, `${filename}.tmp`);
  const finalPath = path.join(dir, filename);
  fs.writeFileSync(tmpPath, JSON.stringify(envelope, null, 2));
  fs.renameSync(tmpPath, finalPath);
  return filename;
}

module.exports = { writeMessage };
