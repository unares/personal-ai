'use strict';

const windows = new Map();

function rateLimit(opts = {}) {
  const { maxRequests = 20, windowMs = 60000 } = opts;

  return (req, res, next) => {
    const caller = req.headers['x-cl-caller'] || req.query.for || 'anonymous';
    const now = Date.now();
    const hits = windows.get(caller) || [];
    const valid = hits.filter(t => now - t < windowMs);

    if (valid.length >= maxRequests) {
      const oldest = valid[0];
      const retryAfter = Math.ceil((oldest + windowMs - now) / 1000);
      res.set('Retry-After', String(retryAfter));
      return res.status(429).json({
        error: 'Rate limit exceeded',
        retry_after: retryAfter
      });
    }

    valid.push(now);
    windows.set(caller, valid);
    next();
  };
}

function cleanupWindows() {
  const now = Date.now();
  for (const [caller, hits] of windows) {
    const valid = hits.filter(t => now - t < 60000);
    if (valid.length === 0) windows.delete(caller);
    else windows.set(caller, valid);
  }
}

setInterval(cleanupWindows, 60000).unref();

module.exports = { rateLimit };
