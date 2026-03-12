'use strict';

function init(ctx) {
  ctx.log.info('stage', 'STUB — not connected (Layer 3)');

  function requestTransition(app, fromStage, toStage) {
    ctx.log.info('stage', `Transition request: ${app} ${fromStage} -> ${toStage}`);
    ctx.ipc.send('stage-signal', 'nanoclaw-paw', {
      entity: ctx.entity, app, fromStage, toStage
    });
  }

  function handleStageAck(envelope) {
    const { status, app, fromStage, toStage } = envelope.payload;
    ctx.log.info('stage', `Stage ack: ${app} ${fromStage}->${toStage} = ${status}`);
    return { acknowledged: true };
  }

  return { requestTransition, handleStageAck };
}

module.exports = { init };
