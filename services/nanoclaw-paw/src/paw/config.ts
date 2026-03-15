/**
 * PAW-specific configuration.
 * Workspace-level config that extends NanoClaw's config.ts.
 */
import fs from 'fs';
import path from 'path';

import { logger } from '../logger.js';

/** PAW IPC poll interval (1s — matches workspace IPC spec) */
export const PAW_IPC_POLL_INTERVAL = 1000;

/** Stage health check timeout (120s, configurable) */
export const STAGE_HEALTH_CHECK_TIMEOUT = parseInt(
  process.env.PAW_STAGE_TIMEOUT || '120000',
  10,
);

/** Stage health check poll interval (5s) */
export const STAGE_HEALTH_CHECK_INTERVAL = 5000;

/** Persistent registry refresh interval (30s) */
export const REGISTRY_REFRESH_INTERVAL = 30000;

/** Ephemeral companion idle timeout (30 min) */
export const EPHEMERAL_COMPANION_IDLE_TIMEOUT = parseInt(
  process.env.PAW_COMPANION_IDLE_TIMEOUT || '1800000',
  10,
);

/** Ephemeral companion Docker network */
export const EPHEMERAL_COMPANION_NETWORK = 'ephemeral-companion-net';

export interface TelegramConfig {
  botTokenEnv: string;
  mode: 'dm' | 'group';
  trigger?: string;
  allowedUsers: string[];
}

export interface PawRoutingEntry {
  target: 'clark' | 'aioo' | 'unares';
  entity: string | string[];
  human: string;
  telegram?: TelegramConfig;
}

/** Normalize entity to array (supports single string or array in routing config). */
export function normalizeEntities(entry: PawRoutingEntry): string[] {
  return Array.isArray(entry.entity) ? entry.entity : [entry.entity];
}

export interface PawRoutingConfig {
  routes: Record<string, PawRoutingEntry>;
}

/** Resolve ENV: prefixed values in routing config. */
function resolveEnvValue(value: string): string | null {
  if (!value.startsWith('ENV:')) return value;
  const envKey = value.slice(4);
  const resolved = process.env[envKey];
  if (!resolved) {
    logger.warn({ envKey }, 'Unresolved ENV: reference in routing config');
    return null;
  }
  return resolved;
}

function resolveEnvValues(config: PawRoutingConfig): void {
  for (const [name, route] of Object.entries(config.routes)) {
    if (!route.telegram?.allowedUsers) continue;
    route.telegram.allowedUsers = route.telegram.allowedUsers
      .map(resolveEnvValue)
      .filter((v): v is string => v !== null);
  }
}

let routingConfig: PawRoutingConfig | null = null;

/**
 * Load routing config from nanoclaw-config/routing.json.
 * Resolves ENV: prefixed values in allowedUsers arrays.
 */
export function loadRoutingConfig(workspaceRoot: string, force = false): PawRoutingConfig {
  if (routingConfig && !force) return routingConfig;

  const configPath = path.join(
    workspaceRoot,
    'nanoclaw-config',
    'routing.json',
  );

  try {
    const content = fs.readFileSync(configPath, 'utf-8');
    routingConfig = JSON.parse(content) as PawRoutingConfig;
    resolveEnvValues(routingConfig);
    logger.info(
      { routes: Object.keys(routingConfig.routes).length },
      'PAW routing config loaded',
    );
    return routingConfig;
  } catch (err) {
    logger.warn(
      { path: configPath, err },
      'PAW routing config not found, using empty config',
    );
    routingConfig = { routes: {} };
    return routingConfig;
  }
}

/**
 * Resolve workspace root from PAW's location.
 * PAW lives at services/nanoclaw-paw/ — workspace root is two levels up.
 */
export function resolveWorkspaceRoot(): string {
  if (process.env.PAW_WORKSPACE_ROOT) {
    return process.env.PAW_WORKSPACE_ROOT;
  }
  return path.resolve(process.cwd(), '..', '..');
}

/**
 * Get configured entities by scanning ipc/aioo-{entity}/ directories.
 */
export function discoverEntities(workspaceRoot: string): string[] {
  const ipcRoot = path.join(workspaceRoot, 'ipc');
  try {
    return fs
      .readdirSync(ipcRoot)
      .filter((d) => d.startsWith('aioo-'))
      .map((d) => d.slice(5))
      .filter((e) => {
        const dir = path.join(ipcRoot, `aioo-${e}`);
        return fs.statSync(dir).isDirectory();
      });
  } catch {
    return [];
  }
}
