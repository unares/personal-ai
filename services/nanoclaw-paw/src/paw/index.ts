/**
 * NanoClaw-PAW Entry Point.
 *
 * Initializes all PAW extension modules and wires them into
 * the NanoClaw event loop.
 */
import { logger } from '../logger.js';
import {
  discoverEntities,
  loadRoutingConfig,
  REGISTRY_REFRESH_INTERVAL,
  resolveWorkspaceRoot,
} from './config.js';
import { refreshRegistry } from './persistent-registry.js';
import {
  MessageHandler,
  startPawIpcPoller,
  writeHealthPong,
} from './ipc-poller.js';
import { handleStageSignal } from './stage-handler.js';
import { handleSpawnAgent } from './agent-spawn-handler.js';
import {
  ensureClarkNetwork,
  startIdleChecker,
  stopAllClark,
  stopIdleChecker,
} from './clark-handler.js';

let registryTimer: ReturnType<typeof setInterval> | null = null;
let startTime: number;

function buildIpcHandlers(workspaceRoot: string): Record<string, MessageHandler> {
  return {
    'stage-signal': (envelope) =>
      handleStageSignal(envelope, workspaceRoot),
    'spawn-agent': (envelope) =>
      handleSpawnAgent(envelope, workspaceRoot),
    'human-reply': async (envelope) => {
      logger.info(
        { type: envelope.type, to: envelope.payload.channel },
        'Human-reply IPC received (messaging handler pending)',
      );
    },
    'health-ping': async (envelope) => {
      const uptime = Math.floor((Date.now() - startTime) / 1000);
      await writeHealthPong(workspaceRoot, 'ok', uptime, envelope.id);
    },
  };
}

/**
 * Initialize all PAW extensions.
 */
export async function initPaw(): Promise<void> {
  startTime = Date.now();
  const workspaceRoot = resolveWorkspaceRoot();
  const entities = discoverEntities(workspaceRoot);

  logger.info({ workspaceRoot, entities }, 'Initializing NanoClaw-PAW');

  loadRoutingConfig(workspaceRoot);
  ensureClarkNetwork();
  refreshRegistry(workspaceRoot);

  registryTimer = setInterval(
    () => refreshRegistry(workspaceRoot),
    REGISTRY_REFRESH_INTERVAL,
  );
  startIdleChecker();

  await startPawIpcPoller({
    workspaceRoot,
    entities,
    handlers: buildIpcHandlers(workspaceRoot),
  });

  logger.info('NanoClaw-PAW extensions initialized');
}

/**
 * Graceful shutdown of PAW extensions.
 */
export async function shutdownPaw(): Promise<void> {
  if (registryTimer) {
    clearInterval(registryTimer);
    registryTimer = null;
  }
  stopIdleChecker();
  stopAllClark();
  logger.info('NanoClaw-PAW extensions shut down');
}

// Re-export for external use
export { getOrSpawnClark, recordActivity } from './clark-handler.js';
export {
  getAiooContainer,
  getAllPersistent,
  isPersistentContainer,
} from './persistent-registry.js';
export { writeToAioo } from './ipc-poller.js';
export { loadRoutingConfig } from './config.js';
