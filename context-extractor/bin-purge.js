'use strict';

const fs = require('fs');
const path = require('path');

// Audit-only mode: nothing is ever auto-deleted.
// Bin contents are logged for manual review but preserved indefinitely.

function auditEntityBin(vaultPath, entityName) {
  const binDir = path.join(vaultPath, entityName, 'Bin');
  if (!fs.existsSync(binDir)) return { total: 0, old: 0 };

  let total = 0;
  let old = 0;
  const now = Date.now();
  const AGE_120_DAYS = 120 * 24 * 60 * 60 * 1000;
  const entries = fs.readdirSync(binDir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(binDir, entry.name);
    const stat = fs.statSync(fullPath);
    total++;
    if (now - stat.mtimeMs > AGE_120_DAYS) {
      old++;
    }
  }
  return { total, old };
}

function startBinAuditSchedule(vaultPath, entityNames, intervalMs) {
  const interval = intervalMs || 24 * 60 * 60 * 1000; // daily

  function run() {
    for (const name of entityNames) {
      const { total, old } = auditEntityBin(vaultPath, name);
      if (total > 0) {
        console.log(`[bin-audit] ${name}: ${total} items in Bin (${old} older than 120 days — preserved)`);
      }
    }
  }

  run(); // run once at startup
  setInterval(run, interval);
}

module.exports = { auditEntityBin, startBinAuditSchedule };
