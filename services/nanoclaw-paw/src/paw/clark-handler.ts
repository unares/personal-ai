/**
 * Clark Handler for NanoClaw-PAW.
 *
 * Manages ephemeral Clark containers:
 * - Spawns on message via docker run --rm --network clark-net
 * - Mounts Distilled/ read-only (air-gapped from AIOO/entity networks)
 * - 30min idle timeout → auto-removed
 * - Credential proxy via clark-net → host:3001
 */
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

import { logger } from '../logger.js';
import { CLARK_IDLE_TIMEOUT, CLARK_NETWORK } from './config.js';

interface ClarkInstance {
  containerName: string;
  human: string;
  entity: string;
  lastActivity: number;
}

const activeInstances = new Map<string, ClarkInstance>();
let idleCheckTimer: ReturnType<typeof setInterval> | null = null;

export function ensureClarkNetwork(): void {
  try {
    execSync(`docker network create ${CLARK_NETWORK} 2>/dev/null || true`, {
      timeout: 10000,
    });
    logger.info({ network: CLARK_NETWORK }, 'Clark network ensured');
  } catch (err) {
    logger.error({ err }, 'Failed to create Clark network');
  }
}

export function startIdleChecker(): void {
  if (idleCheckTimer) return;
  idleCheckTimer = setInterval(checkIdleContainers, 60000);
}

export function stopIdleChecker(): void {
  if (idleCheckTimer) {
    clearInterval(idleCheckTimer);
    idleCheckTimer = null;
  }
}

function isContainerAlive(name: string): boolean {
  try {
    const status = execSync(
      `docker inspect --format='{{.State.Status}}' ${name} 2>/dev/null`,
      { encoding: 'utf-8', timeout: 5000 },
    ).trim();
    return status === 'running';
  } catch {
    return false;
  }
}

function buildClarkArgs(
  containerName: string,
  human: string,
  entity: string,
  workspaceRoot: string,
): string[] {
  const distilledDir = path.join(workspaceRoot, 'memory-vault', entity, 'Distilled');
  const clarkIdentity = path.join(workspaceRoot, 'containers', 'clark', 'CLAUDE.md');

  if (!fs.existsSync(distilledDir)) {
    fs.mkdirSync(distilledDir, { recursive: true });
  }

  const args = [
    'run', '-d', '--rm',
    '--name', containerName,
    '--network', CLARK_NETWORK,
  ];

  if (fs.existsSync(clarkIdentity)) {
    args.push('-v', `${clarkIdentity}:/home/node/.claude/CLAUDE.md:ro`);
  }

  args.push(
    '-v', `${distilledDir}:/vault/Distilled:ro`,
    '-e', `HUMAN_NAME=${human}`,
    '-e', `ENTITY=${entity}`,
    '-e', 'CLARK_MODE=true',
    '-e', 'ANTHROPIC_BASE_URL=http://host.docker.internal:3001',
    '-e', 'ANTHROPIC_API_KEY=placeholder',
    'nanoclaw-agent:latest',
  );

  return args;
}

function spawnClarkContainer(
  containerName: string,
  human: string,
  entity: string,
  workspaceRoot: string,
): void {
  const args = buildClarkArgs(containerName, human, entity, workspaceRoot);
  try {
    execSync(`docker ${args.join(' ')}`, { timeout: 30000, encoding: 'utf-8' });
    logger.info({ containerName, human, entity }, 'Clark container spawned');
  } catch (err) {
    logger.error({ containerName, human, err }, 'Failed to spawn Clark');
    activeInstances.delete(`clark-${human}`);
  }
}

export function getOrSpawnClark(
  human: string,
  entity: string,
  workspaceRoot: string,
): string {
  const key = `clark-${human}`;
  const existing = activeInstances.get(key);

  if (existing && isContainerAlive(existing.containerName)) {
    existing.lastActivity = Date.now();
    return existing.containerName;
  }

  const containerName = `clark-${human}-${Date.now()}`;
  spawnClarkContainer(containerName, human, entity, workspaceRoot);
  activeInstances.set(key, {
    containerName, human, entity, lastActivity: Date.now(),
  });
  return containerName;
}

export function recordActivity(human: string): void {
  const instance = activeInstances.get(`clark-${human}`);
  if (instance) instance.lastActivity = Date.now();
}

function checkIdleContainers(): void {
  const now = Date.now();
  for (const [key, instance] of activeInstances) {
    if (now - instance.lastActivity > CLARK_IDLE_TIMEOUT) {
      logger.info({ containerName: instance.containerName }, 'Clark idle timeout');
      try { execSync(`docker stop ${instance.containerName}`, { timeout: 15000 }); } catch { /* ok */ }
      activeInstances.delete(key);
    } else if (!isContainerAlive(instance.containerName)) {
      activeInstances.delete(key);
    }
  }
}

export function stopAllClark(): void {
  for (const [key, instance] of activeInstances) {
    try { execSync(`docker stop ${instance.containerName}`, { timeout: 15000 }); } catch { /* ok */ }
    activeInstances.delete(key);
  }
  stopIdleChecker();
}

export function getActiveClarkInstances(): ClarkInstance[] {
  return [...activeInstances.values()];
}
