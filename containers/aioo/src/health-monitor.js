'use strict';

const fs = require('node:fs');

const ALIVE_PATH = '/tmp/alive';

function init(ctx) {
  const intervalMs = ctx.config.healthIntervalMs || 15000;
  const startTime = Date.now();
  let timer = null;
  let lastCheck = null;

  function writeAlive() {
    const now = new Date();
    fs.writeFileSync(ALIVE_PATH, now.toISOString());
  }

  function check() {
    const checks = {
      ipcReadable: fs.existsSync(ctx.ipcInDir),
      ipcWritable: fs.existsSync(ctx.ipcOutDir),
      vaultWritable: fs.existsSync(ctx.vaultDir)
    };
    const healthy = checks.ipcReadable && checks.ipcWritable && checks.vaultWritable;
    lastCheck = {
      status: healthy ? 'healthy' : 'degraded',
      uptime: Math.floor((Date.now() - startTime) / 1000),
      checks
    };
    return lastCheck;
  }

  function handlePing(envelope) {
    const status = check();
    ctx.ipc.send('health-pong', envelope.from, {
      status: status.status,
      uptime: status.uptime
    }, envelope.id);
  }

  function heartbeat() {
    writeAlive();
    check();
  }

  function stop() {
    if (timer) clearInterval(timer);
    try { fs.unlinkSync(ALIVE_PATH); } catch (e) { /* ignore */ }
  }

  // Start
  writeAlive();
  check();
  timer = setInterval(heartbeat, intervalMs);
  ctx.log.info('health', `Heartbeat every ${intervalMs}ms`);

  return { handlePing, check, stop, getStatus: () => lastCheck };
}

module.exports = { init };
