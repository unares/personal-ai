/**
 * Shared infrastructure for ephemeral companion containers (Clark + Unares).
 *
 * Both companions share the same Docker image, network, and lifecycle pattern.
 * Handler-specific logic (mounts, container naming) stays in each handler.
 */
import { execSync } from 'child_process';
import fs from 'fs';

import { logger } from '../logger.js';
import {
  EPHEMERAL_COMPANION_IDLE_TIMEOUT,
  EPHEMERAL_COMPANION_NETWORK,
} from './config.js';

export const EPHEMERAL_COMPANION_IMAGE = 'ephemeral-companion:latest';

/** Add a read-only volume mount to docker args if the host path exists. */
export function mountIfExists(
  args: string[],
  hostPath: string,
  containerPath: string,
): void {
  if (fs.existsSync(hostPath)) {
    args.push('-v', `${hostPath}:${containerPath}:ro`);
  }
}

/** Build the base docker run args shared by all ephemeral companions. */
export function baseCompanionArgs(containerName: string): string[] {
  return [
    'run', '-d', '--rm',
    '--name', containerName,
    '--network', EPHEMERAL_COMPANION_NETWORK,
  ];
}

/** Append credential proxy env + image to docker args. */
export function appendCompanionEnv(
  args: string[],
  role: string,
  human: string,
  entity: string,
): void {
  args.push(
    '-e', `HUMAN_NAME=${human}`,
    '-e', `ENTITY=${entity}`,
    '-e', `ROLE=${role}`,
    '-e', 'ANTHROPIC_BASE_URL=http://host.docker.internal:3001',
    '-e', 'ANTHROPIC_API_KEY=placeholder',
    EPHEMERAL_COMPANION_IMAGE,
  );
}

export interface CompanionInstance {
  containerName: string;
  role: 'clark' | 'unares';
  human: string;
  lastActivity: number;
}

const activeInstances = new Map<string, CompanionInstance>();
let idleCheckTimer: ReturnType<typeof setInterval> | null = null;

export function ensureEphemeralCompanionNetwork(): void {
  try {
    execSync(
      `docker network create ${EPHEMERAL_COMPANION_NETWORK} 2>/dev/null || true`,
      { timeout: 10000 },
    );
    logger.info(
      { network: EPHEMERAL_COMPANION_NETWORK },
      'Ephemeral companion network ensured',
    );
  } catch (err) {
    logger.error({ err }, 'Failed to create ephemeral companion network');
  }
}

export function isContainerAlive(name: string): boolean {
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

export function registerInstance(
  key: string,
  instance: CompanionInstance,
): void {
  activeInstances.set(key, instance);
}

export function getInstance(key: string): CompanionInstance | undefined {
  return activeInstances.get(key);
}

export function removeInstance(key: string): void {
  activeInstances.delete(key);
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

function checkIdleContainers(): void {
  const now = Date.now();
  for (const [key, instance] of activeInstances) {
    if (now - instance.lastActivity > EPHEMERAL_COMPANION_IDLE_TIMEOUT) {
      logger.info(
        { containerName: instance.containerName, role: instance.role },
        'Companion idle timeout',
      );
      try {
        execSync(`docker stop ${instance.containerName}`, { timeout: 15000 });
      } catch { /* ok */ }
      activeInstances.delete(key);
    } else if (!isContainerAlive(instance.containerName)) {
      activeInstances.delete(key);
    }
  }
}

export function stopAllCompanions(): void {
  for (const [key, instance] of activeInstances) {
    try {
      execSync(`docker stop ${instance.containerName}`, { timeout: 15000 });
    } catch { /* ok */ }
    activeInstances.delete(key);
  }
  stopIdleChecker();
}

export function getActiveInstances(): CompanionInstance[] {
  return [...activeInstances.values()];
}

/** Test helper: clear active instances registry. */
export function _clearInstances(): void {
  activeInstances.clear();
}
