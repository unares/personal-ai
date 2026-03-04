'use strict';

const fs = require('fs');
const path = require('path');

const PURGE_AGE_MS = 180 * 24 * 60 * 60 * 1000; // 180 days

function purgeEntityBin(vaultPath, entityName) {
  const binDir = path.join(vaultPath, entityName, 'Bin');
  if (!fs.existsSync(binDir)) return 0;

  let purged = 0;
  const now = Date.now();
  const entries = fs.readdirSync(binDir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(binDir, entry.name);
    const stat = fs.statSync(fullPath);
    if (now - stat.mtimeMs > PURGE_AGE_MS) {
      if (entry.isDirectory()) {
        fs.rmSync(fullPath, { recursive: true });
      } else {
        fs.unlinkSync(fullPath);
      }
      purged++;
    }
  }
  return purged;
}

function startBinPurgeSchedule(vaultPath, entityNames, intervalMs) {
  const interval = intervalMs || 24 * 60 * 60 * 1000; // daily

  function run() {
    for (const name of entityNames) {
      const count = purgeEntityBin(vaultPath, name);
      if (count > 0) {
        console.log(`[bin-purge] ${name}: purged ${count} items older than 180 days`);
      }
    }
  }

  run(); // run once at startup
  setInterval(run, interval);
}

module.exports = { purgeEntityBin, startBinPurgeSchedule, PURGE_AGE_MS };
