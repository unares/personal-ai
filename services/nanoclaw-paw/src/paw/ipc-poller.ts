/**
 * PAW IPC Poller — reads workspace Typed Envelope IPC directories.
 *
 * Polls ipc/aioo-{entity}/to-paw/ and ipc/watchdog/pings/ at 1s intervals.
 * Uses the workspace's lib/ipc/ library for envelope handling.
 */
import fs from 'fs';
import path from 'path';

import { logger } from '../logger.js';
import { PAW_IPC_POLL_INTERVAL } from './config.js';

interface Envelope {
  id: string;
  type: string;
  from: string;
  to: string;
  timestamp: string;
  payload: Record<string, unknown>;
  replyTo: string | null;
}

interface ReadResult {
  envelope: Envelope;
  file: string;
}

interface IpcLib {
  createEnvelope: (
    type: string, from: string, to: string,
    payload: Record<string, unknown>, replyTo?: string | null,
  ) => Envelope;
  writeMessage: (dir: string, envelope: Envelope) => string;
  readMessages: (dir: string) => ReadResult[];
  processMessage: (dir: string, file: string) => void;
}

export type MessageHandler = (envelope: Envelope) => Promise<void>;

let ipcLib: IpcLib | null = null;
let pollerRunning = false;
let _ipcLibPromise: Promise<IpcLib> | null = null;

async function getIpcLib(workspaceRoot: string): Promise<IpcLib> {
  if (ipcLib) return ipcLib;
  if (!_ipcLibPromise) {
    _ipcLibPromise = (async () => {
      const { createRequire } = await import('module');
      const req = createRequire(import.meta.url);
      ipcLib = req(path.join(workspaceRoot, 'lib', 'ipc')) as unknown as IpcLib;
      return ipcLib;
    })();
  }
  return _ipcLibPromise;
}

export interface PawIpcDeps {
  workspaceRoot: string;
  entities: string[];
  handlers: Record<string, MessageHandler>;
}

function buildPollDirs(
  workspaceRoot: string,
  entities: string[],
): Array<{ dir: string; label: string }> {
  const dirs: Array<{ dir: string; label: string }> = [];
  for (const entity of entities) {
    const dir = path.join(workspaceRoot, 'ipc', `aioo-${entity}`, 'to-paw');
    if (fs.existsSync(dir)) {
      dirs.push({ dir, label: `aioo-${entity}/to-paw` });
    }
  }
  const watchdogDir = path.join(workspaceRoot, 'ipc', 'watchdog', 'pings');
  if (fs.existsSync(watchdogDir)) {
    dirs.push({ dir: watchdogDir, label: 'watchdog/pings' });
  }
  const watchdogToPaw = path.join(workspaceRoot, 'ipc', 'watchdog', 'to-paw');
  if (fs.existsSync(watchdogToPaw)) {
    dirs.push({ dir: watchdogToPaw, label: 'watchdog/to-paw' });
  }
  return dirs;
}

async function processDir(
  lib: IpcLib,
  dir: string,
  label: string,
  handlers: Record<string, MessageHandler>,
): Promise<void> {
  const messages = lib.readMessages(dir);
  for (const { envelope, file } of messages) {
    const handler = handlers[envelope.type];
    if (handler) {
      try { await handler(envelope); } catch (err) {
        logger.error({ type: envelope.type, id: envelope.id, err }, 'PAW IPC handler error');
      }
    } else {
      logger.warn({ type: envelope.type, label }, 'No PAW handler for message type');
    }
    lib.processMessage(dir, file);
  }
}

/**
 * Start the PAW IPC poller.
 */
export async function startPawIpcPoller(deps: PawIpcDeps): Promise<void> {
  if (pollerRunning) return;
  pollerRunning = true;

  const lib = await getIpcLib(deps.workspaceRoot);
  const pollDirs = buildPollDirs(deps.workspaceRoot, deps.entities);
  logger.info({ dirs: pollDirs.map((d) => d.label) }, 'PAW IPC poller started');

  const poll = async () => {
    for (const { dir, label } of pollDirs) {
      try { await processDir(lib, dir, label, deps.handlers); } catch (err) {
        logger.error({ dir: label, err }, 'PAW IPC poll error');
      }
    }
    setTimeout(poll, PAW_IPC_POLL_INTERVAL);
  };
  poll();
}

/**
 * Write a message to an entity's from-paw IPC directory.
 */
export async function writeToAioo(
  workspaceRoot: string,
  entity: string,
  type: string,
  payload: Record<string, unknown>,
  replyTo?: string | null,
): Promise<string> {
  const lib = await getIpcLib(workspaceRoot);
  const dir = path.join(workspaceRoot, 'ipc', `aioo-${entity}`, 'from-paw');
  const envelope = lib.createEnvelope(type, 'nanoclaw-paw', `aioo-${entity}`, payload, replyTo ?? null);
  return lib.writeMessage(dir, envelope);
}

/**
 * Write a health pong to the watchdog directory.
 */
export async function writeHealthPong(
  workspaceRoot: string,
  status: string,
  uptime: number,
  replyTo?: string | null,
): Promise<string> {
  const lib = await getIpcLib(workspaceRoot);
  const dir = path.join(workspaceRoot, 'ipc', 'watchdog', 'pongs');
  const envelope = lib.createEnvelope('health-pong', 'nanoclaw-paw', 'watchdog', { status, uptime }, replyTo ?? null);
  return lib.writeMessage(dir, envelope);
}
