'use strict';

function createEventLoop(ctx, handlers) {
  const intervalMs = ctx.config.pollIntervalMs || 1000;
  let timer = null;
  let running = false;

  async function tick() {
    if (running) return;
    running = true;
    try {
      const messages = ctx.ipc.readIncoming();
      for (const { envelope, file } of messages) {
        const handler = handlers[envelope.type];
        if (handler) {
          try {
            await handler(envelope);
          } catch (err) {
            ctx.log.error('event-loop', `Handler error for ${envelope.type}`, err);
          }
        } else {
          ctx.log.warn('event-loop', `Unknown message type: ${envelope.type}`);
        }
        ctx.ipc.markProcessed(file);
      }
    } catch (err) {
      ctx.log.error('event-loop', 'Tick error', err);
    }
    running = false;
  }

  function start() {
    timer = setInterval(tick, intervalMs);
    ctx.log.info('event-loop', `Polling every ${intervalMs}ms`);
  }

  function stop() {
    if (timer) clearInterval(timer);
    ctx.log.info('event-loop', 'Stopped');
  }

  return { start, stop };
}

module.exports = { createEventLoop };
