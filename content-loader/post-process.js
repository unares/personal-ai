'use strict';

const {
  getAllProcessedFiles, updateTrustScore,
  getExpiredPredictions, resolvePrediction,
  purgeOldUsage, getRecentUsageForEntry
} = require('./db');
const { calcTrustWithDecay } = require('./intelligence');
const { sweepBlogCandidates } = require('./story-blog');

let interval = null;
const notifications = new Map();

function updateTrustDecay(entities) {
  let updated = 0;
  for (const entity of entities) {
    const files = getAllProcessedFiles(entity);
    for (const file of files) {
      const decayed = calcTrustWithDecay(file.trust_score, file.processed_at);
      if (Math.abs(decayed - file.trust_score) >= 0.005) {
        updateTrustScore(file.id, decayed);
        updated++;
      }
    }
  }
  if (updated > 0) console.log(`[post-process] Trust decay updated ${updated} entries`);
}

function correlateUsage(entities) {
  let boosted = 0;
  for (const entity of entities) {
    const files = getAllProcessedFiles(entity);
    for (const file of files) {
      const usage = getRecentUsageForEntry(file.distilled_path, 7);
      if (usage && usage.count >= 3) {
        const boost = Math.min(0.1, usage.count * 0.01);
        const newScore = Math.min(1, +(file.trust_score + boost).toFixed(3));
        if (newScore > file.trust_score) {
          updateTrustScore(file.id, newScore);
          boosted++;
        }
      }
    }
  }
  if (boosted > 0) console.log(`[post-process] Usage-boosted ${boosted} entries`);
}

function expirePredictions(entities) {
  let expired = 0;
  for (const entity of entities) {
    const preds = getExpiredPredictions(entity);
    for (const pred of preds) {
      resolvePrediction(pred.id, 'expired', 'Auto-expired past resolution target');
      expired++;
    }
  }
  if (expired > 0) console.log(`[post-process] Expired ${expired} predictions`);
}

function consolidateOverlapping(entity) {
  const files = getAllProcessedFiles(entity);
  const byCategory = {};
  for (const f of files) {
    const key = `${f.entity}/${f.category}`;
    if (!byCategory[key]) byCategory[key] = [];
    byCategory[key].push(f);
  }

  const flags = [];
  for (const [key, entries] of Object.entries(byCategory)) {
    if (entries.length < 2) continue;
    for (let i = 0; i < entries.length; i++) {
      for (let j = i + 1; j < entries.length; j++) {
        const overlap = calcContentOverlap(
          entries[i].body_preview || '', entries[j].body_preview || ''
        );
        if (overlap > 0.6) {
          flags.push({
            entity, category: entries[i].category,
            files: [entries[i].distilled_path, entries[j].distilled_path],
            overlap: +(overlap).toFixed(2),
            action: 'consider_merge'
          });
        }
      }
    }
  }
  return flags;
}

function calcContentOverlap(textA, textB) {
  if (!textA || !textB) return 0;
  const wordsA = new Set(textA.toLowerCase().split(/\s+/).filter(w => w.length > 3));
  const wordsB = new Set(textB.toLowerCase().split(/\s+/).filter(w => w.length > 3));
  if (wordsA.size === 0 || wordsB.size === 0) return 0;
  let shared = 0;
  for (const w of wordsA) { if (wordsB.has(w)) shared++; }
  return shared / Math.min(wordsA.size, wordsB.size);
}

function cleanupUsageLog(days = 30) {
  const result = purgeOldUsage(days);
  if (result.changes > 0) {
    console.log(`[post-process] Purged ${result.changes} old usage log entries`);
  }
}

function addNotification(entity, notification) {
  if (!notifications.has(entity)) notifications.set(entity, []);
  notifications.get(entity).push({
    ...notification,
    timestamp: new Date().toISOString()
  });
}

function getPendingNotifications(entity) {
  return notifications.get(entity) || [];
}

function clearNotifications(entity) {
  notifications.delete(entity);
}

function runPostProcessing(entities) {
  try {
    updateTrustDecay(entities);
    correlateUsage(entities);
    expirePredictions(entities);
    for (const entity of entities) {
      const swept = sweepBlogCandidates(entity);
      if (swept > 0) {
        addNotification(entity, {
          type: 'blog_candidates_found',
          message: `${swept} new blog-eligible entries detected`
        });
      }
    }
    cleanupUsageLog(30);
  } catch (err) {
    console.error(`[post-process] Error: ${err.message}`);
  }
}

function startPostProcessor(entities, intervalMs = 30000) {
  if (interval) return;
  console.log(`[post-process] Starting background loop (${intervalMs}ms)`);
  interval = setInterval(() => runPostProcessing(entities), intervalMs);
  interval.unref();
}

function stopPostProcessor() {
  if (interval) { clearInterval(interval); interval = null; }
}

module.exports = {
  startPostProcessor, stopPostProcessor, runPostProcessing,
  updateTrustDecay, correlateUsage, consolidateOverlapping,
  expirePredictions, cleanupUsageLog,
  addNotification, getPendingNotifications, clearNotifications
};
