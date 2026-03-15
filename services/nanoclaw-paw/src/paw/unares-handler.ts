/**
 * Unares Handler for NanoClaw-PAW.
 *
 * Manages the ephemeral Unares container:
 * - Spawns on Telegram DM from Michal (ai-architect only)
 * - Full vault read-only, IPC read-only, logs read-only
 * - 30min idle timeout → auto-removed
 * - Credential proxy via ephemeral-companion-net → host:3001
 */
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

import { logger } from '../logger.js';
// Config import removed — network is in ephemeral-companion.ts
import {
  appendCompanionEnv,
  baseCompanionArgs,
  getInstance,
  isContainerAlive,
  mountIfExists,
  registerInstance,
  removeInstance,
} from './ephemeral-companion.js';

export function buildUnaresArgs(
  containerName: string,
  workspaceRoot: string,
): string[] {
  const unaresIdentity = path.join(
    workspaceRoot, 'containers', 'unares', 'CLAUDE.md',
  );
  const unaresSettings = path.join(
    workspaceRoot, 'containers', 'unares', 'settings.json',
  );

  const args = baseCompanionArgs(containerName);

  // Identity
  mountIfExists(args, unaresIdentity, '/home/clark/.claude/CLAUDE.md');
  mountIfExists(args, unaresSettings, '/home/clark/.claude/settings.json');

  // Observation mounts (all read-only)
  mountIfExists(args, path.join(workspaceRoot, 'memory-vault'), '/vault');
  mountIfExists(args, path.join(workspaceRoot, 'ipc'), '/ipc');
  mountIfExists(args, path.join(workspaceRoot, 'logs'), '/logs');
  mountIfExists(args, path.join(workspaceRoot, 'nanoclaw-config', 'routing.json'), '/config/routing.json');

  appendCompanionEnv(args, 'unares', 'michal', 'ai-workspace,procenteo,inisio');

  return args;
}

function spawnUnaresContainer(
  containerName: string,
  workspaceRoot: string,
): void {
  const args = buildUnaresArgs(containerName, workspaceRoot);
  try {
    execSync(`docker ${args.join(' ')}`, { timeout: 30000, encoding: 'utf-8' });
    logger.info({ containerName }, 'Unares container spawned');
  } catch (err) {
    logger.error({ containerName, err }, 'Failed to spawn Unares');
    removeInstance('unares');
  }
}

export function getOrSpawnUnares(workspaceRoot: string): string {
  const key = 'unares';
  const existing = getInstance(key);

  if (existing && isContainerAlive(existing.containerName)) {
    existing.lastActivity = Date.now();
    return existing.containerName;
  }

  const containerName = `unares-${Date.now()}`;
  spawnUnaresContainer(containerName, workspaceRoot);
  registerInstance(key, {
    containerName, role: 'unares', human: 'michal', lastActivity: Date.now(),
  });
  return containerName;
}

export async function sendToUnares(
  message: string,
  workspaceRoot: string,
): Promise<string> {
  const containerName = getOrSpawnUnares(workspaceRoot);
  try {
    const escaped = message.replace(/'/g, "'\\''");
    const output = execSync(
      `docker exec ${containerName} claude --dangerously-skip-permissions --message '${escaped}'`,
      { encoding: 'utf-8', timeout: 120000 },
    );
    return output.trim();
  } catch (err) {
    logger.error({ containerName, err }, 'Failed to exec Unares');
    return 'Unares is unavailable';
  }
}
