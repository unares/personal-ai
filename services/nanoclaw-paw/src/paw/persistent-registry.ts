/**
 * Persistent Container Registry for NanoClaw-PAW.
 * Tracks containers managed by Docker Compose (AIOO, stage containers).
 * Router checks this before spawning ephemeral containers.
 */
import { execSync } from 'child_process';

import { logger } from '../logger.js';

export interface PersistentContainer {
  name: string;
  entity: string;
  type: 'aioo' | 'stage';
  ipcDir: string;
  lastSeen: string;
}

const registry = new Map<string, PersistentContainer>();

function parseContainerName(
  name: string,
): { entity: string; type: 'aioo' | 'stage' } | null {
  if (name.startsWith('aioo-')) {
    return { entity: name.slice(5), type: 'aioo' };
  }
  const stageMatch = name.match(/^(.+)-app-(demo|testing|launch|scaling)$/);
  if (stageMatch) {
    return { entity: stageMatch[1], type: 'stage' };
  }
  return null;
}

function fetchRunningContainers(): string[] {
  try {
    const output = execSync(
      'docker ps --filter "label=com.docker.compose.project" --format "{{.Names}}"',
      { encoding: 'utf-8', timeout: 10000 },
    ).trim();
    return output ? output.split('\n').filter(Boolean) : [];
  } catch (err) {
    logger.error({ err }, 'Failed to fetch running containers');
    return [];
  }
}

function registerContainer(name: string, workspaceRoot: string): void {
  const parsed = parseContainerName(name);
  if (!parsed) return;

  const ipcDir =
    parsed.type === 'aioo'
      ? `${workspaceRoot}/ipc/aioo-${parsed.entity}/from-paw`
      : '';

  registry.set(name, {
    name,
    entity: parsed.entity,
    type: parsed.type,
    ipcDir,
    lastSeen: new Date().toISOString(),
  });

  logger.info(
    { name, entity: parsed.entity, type: parsed.type },
    'Persistent container registered',
  );
}

/**
 * Populate registry by inspecting running Docker Compose containers.
 */
export function refreshRegistry(workspaceRoot: string): void {
  const names = fetchRunningContainers();
  const seen = new Set(names);
  const now = new Date().toISOString();

  for (const name of names) {
    if (registry.has(name)) {
      registry.get(name)!.lastSeen = now;
    } else {
      registerContainer(name, workspaceRoot);
    }
  }

  for (const [name] of registry) {
    if (!seen.has(name)) {
      registry.delete(name);
      logger.info({ name }, 'Persistent container removed');
    }
  }
}

export function getAiooContainer(entity: string): PersistentContainer | undefined {
  return registry.get(`aioo-${entity}`);
}

export function getStageContainer(entity: string, stage: string): PersistentContainer | undefined {
  return registry.get(`${entity}-app-${stage}`);
}

export function getAllPersistent(): PersistentContainer[] {
  return [...registry.values()];
}

export function isPersistentContainer(name: string): boolean {
  return registry.has(name);
}

/** @internal — for tests only */
export function _clearRegistry(): void {
  registry.clear();
}
