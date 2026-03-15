/**
 * Clark Handler for NanoClaw-PAW.
 *
 * Manages ephemeral Clark containers:
 * - Spawns on message via docker run --rm --network ephemeral-companion-net
 * - Mounts Distilled/ read-only per entity (air-gapped from AIOO/entity networks)
 * - 30min idle timeout → auto-removed
 * - Credential proxy via ephemeral-companion-net → host:3001
 */
import { exec, execSync } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';

import { logger } from '../logger.js';
import { normalizeEntities } from './config.js';
import type { PawRoutingEntry } from './config.js';
import {
  appendCompanionEnv,
  baseCompanionArgs,
  getInstance,
  isContainerAlive,
  mountIfExists,
  registerInstance,
  removeInstance,
} from './ephemeral-companion.js';

const execAsync = promisify(exec);

export function buildClarkArgs(
  containerName: string,
  human: string,
  entities: string[],
  workspaceRoot: string,
): string[] {
  const companionDir = path.join(workspaceRoot, 'containers', 'ephemeral-companion');
  const args = baseCompanionArgs(containerName);

  // Identity
  mountIfExists(args, path.join(companionDir, 'CLAUDE.md'), '/home/clark/.claude/CLAUDE.md');
  mountIfExists(args, path.join(companionDir, 'settings.json'), '/home/clark/.claude/settings.json');
  mountIfExists(args, path.join(workspaceRoot, 'memory-vault', 'SOUL.md'), '/vault/SOUL.md');
  mountIfExists(args, path.join(workspaceRoot, 'memory-vault', 'CLARK_IDENTITY.md'), '/vault/CLARK_IDENTITY.md');

  // Distilled/ per entity (air-gapped from AIOO)
  for (const entity of entities) {
    const distilledDir = path.join(workspaceRoot, 'memory-vault', entity, 'Distilled');
    if (!fs.existsSync(distilledDir)) fs.mkdirSync(distilledDir, { recursive: true });
    args.push('-v', `${distilledDir}:/vault/${entity}/Distilled:ro`);
  }

  appendCompanionEnv(args, 'clark', human, entities.join(','));

  return args;
}

function spawnClarkContainer(
  containerName: string,
  human: string,
  entities: string[],
  workspaceRoot: string,
): void {
  const args = buildClarkArgs(containerName, human, entities, workspaceRoot);
  try {
    execSync(`docker ${args.join(' ')}`, { timeout: 30000, encoding: 'utf-8' });
    logger.info({ containerName, human, entities }, 'Clark container spawned');
  } catch (err) {
    logger.error({ containerName, human, err }, 'Failed to spawn Clark');
    removeInstance(`clark-${human}`);
  }
}

export function getOrSpawnClark(
  human: string,
  route: PawRoutingEntry,
  workspaceRoot: string,
): string {
  const key = `clark-${human}`;
  const existing = getInstance(key);
  const entities = normalizeEntities(route);

  if (existing && isContainerAlive(existing.containerName)) {
    existing.lastActivity = Date.now();
    return existing.containerName;
  }

  const containerName = `clark-${human}-${Date.now()}`;
  spawnClarkContainer(containerName, human, entities, workspaceRoot);
  registerInstance(key, {
    containerName, role: 'clark', human, lastActivity: Date.now(),
  });
  return containerName;
}

export async function sendToClark(
  message: string,
  human: string,
  route: PawRoutingEntry,
  workspaceRoot: string,
): Promise<string> {
  const containerName = getOrSpawnClark(human, route, workspaceRoot);
  try {
    const escaped = message.replace(/'/g, "'\\''");
    const { stdout } = await execAsync(
      `docker exec ${containerName} claude --dangerously-skip-permissions --model claude-sonnet-4-6 --print '${escaped}'`,
      { encoding: 'utf-8', timeout: 300000 },
    );
    return stdout.trim();
  } catch (err) {
    logger.error({ containerName, human, err }, 'Failed to exec Clark');
    return 'Clark is temporarily unavailable. Please try again.';
  }
}

export function recordActivity(human: string): void {
  const instance = getInstance(`clark-${human}`);
  if (instance) instance.lastActivity = Date.now();
}
