'use strict';

const ipcLibPath = process.env.IPC_LIB_PATH
  ? require('node:path').resolve(process.env.IPC_LIB_PATH)
  : '/app/lib/ipc';
const ipcLib = require(ipcLibPath);

function init(ctx) {
  function send(type, to, payload, replyTo) {
    const envelope = ipcLib.createEnvelope(
      type,
      `aioo-${ctx.entity}`,
      to,
      payload,
      replyTo || null
    );
    const file = ipcLib.writeMessage(ctx.ipcOutDir, envelope);
    ctx.log.info('ipc', `Sent ${type} -> ${to} (${file})`);
    return envelope;
  }

  function readIncoming() {
    return ipcLib.readMessages(ctx.ipcInDir);
  }

  function markProcessed(file) {
    ipcLib.processMessage(ctx.ipcInDir, file);
  }

  ctx.log.info('ipc', `In: ${ctx.ipcInDir} | Out: ${ctx.ipcOutDir}`);
  return { send, readIncoming, markProcessed };
}

module.exports = { init };
