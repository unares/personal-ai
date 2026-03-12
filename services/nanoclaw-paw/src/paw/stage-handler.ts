/**
 * Stage Handler for NanoClaw-PAW.
 *
 * Receives stage-signal IPC from AIOO, executes Docker Compose profile
 * transitions (up new, health check, down old), returns stage-ack.
 *
 * Must-not-do: decide whether to transition (AIOO decides), skip health checks,
 * modify vault content, run as separate process.
 */
import { exec, execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';

import { logger } from '../logger.js';
import {
  STAGE_HEALTH_CHECK_INTERVAL,
  STAGE_HEALTH_CHECK_TIMEOUT,
} from './config.js';
import { writeToAioo } from './ipc-poller.js';

const execAsync = promisify(exec);

const VALID_STAGES = ['demo', 'testing', 'launch', 'scaling'] as const;
type Stage = (typeof VALID_STAGES)[number];

const VALID_PROGRESSION: Record<Stage, Stage | null> = {
  demo: 'testing',
  testing: 'launch',
  launch: 'scaling',
  scaling: null,
};

interface StageSignal {
  entity: string;
  app: string;
  fromStage: string;
  toStage: string;
}

interface StageEnvelope {
  id: string;
  type: string;
  from: string;
  payload: Record<string, unknown>;
}

function isValidStage(stage: string): stage is Stage {
  return VALID_STAGES.includes(stage as Stage);
}

function isContainerRunning(name: string): boolean {
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

function hasHealthCheck(container: string): boolean {
  try {
    const result = execSync(
      `docker inspect --format='{{if .State.Health}}yes{{end}}' ${container} 2>/dev/null`,
      { encoding: 'utf-8', timeout: 5000 },
    ).trim();
    return result === 'yes';
  } catch {
    return false;
  }
}

function getHealthStatus(container: string): string | null {
  try {
    return execSync(
      `docker inspect --format='{{.State.Health.Status}}' ${container} 2>/dev/null`,
      { encoding: 'utf-8', timeout: 5000 },
    ).trim();
  } catch {
    return null;
  }
}

async function waitForHealthy(
  container: string,
  timeout: number,
  interval: number,
): Promise<boolean> {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const status = getHealthStatus(container);
    if (status === 'healthy') return true;
    if (status === 'unhealthy') return false;
    if (!status && isContainerRunning(container) && !hasHealthCheck(container)) {
      return true;
    }
    await new Promise((r) => setTimeout(r, interval));
  }
  return false;
}

async function sendAck(
  workspaceRoot: string,
  entity: string,
  status: 'success' | 'failed',
  base: Record<string, unknown>,
  startTime: number,
  reason: string | null,
  replyTo: string,
): Promise<void> {
  const duration = `${Date.now() - startTime}ms`;
  await writeToAioo(workspaceRoot, entity, 'stage-ack', {
    status, ...base, duration, reason,
  }, replyTo);
  if (status === 'failed') {
    logger.warn({ ...base, reason }, 'Stage transition failed');
  }
}

function logTransition(
  workspaceRoot: string,
  signal: StageSignal,
  durationMs: number,
): void {
  const logDir = path.join(
    workspaceRoot, 'memory-vault', signal.entity, 'Logs',
  );
  try {
    fs.mkdirSync(logDir, { recursive: true });
    const entry = [
      `## ${new Date().toISOString()} — Stage Transition`,
      `App: ${signal.app}`,
      `From: ${signal.fromStage} → To: ${signal.toStage}`,
      `Duration: ${durationMs}ms`,
      `Status: success`,
      '',
    ].join('\n');
    fs.appendFileSync(path.join(logDir, 'stage-transitions.md'), entry);
  } catch (err) {
    logger.error({ err }, 'Failed to log stage transition');
  }
}

function validateSignal(
  envelope: StageEnvelope,
  signal: StageSignal,
): string | null {
  if (!envelope.from.startsWith('aioo-')) {
    return 'non-aioo-source';
  }
  if (envelope.from !== `aioo-${signal.entity}`) {
    return `Sender ${envelope.from} does not match entity ${signal.entity}`;
  }
  if (!isValidStage(signal.fromStage) || !isValidStage(signal.toStage)) {
    return `Invalid stage: ${signal.fromStage} → ${signal.toStage}`;
  }
  if (VALID_PROGRESSION[signal.fromStage as Stage] !== signal.toStage) {
    return `Invalid progression: ${signal.fromStage} → ${signal.toStage}`;
  }
  const fromContainer = `${signal.app}-app-${signal.fromStage}`;
  if (!isContainerRunning(fromContainer)) {
    return `From-stage container ${fromContainer} is not running`;
  }
  return null;
}

async function composeUp(composeFile: string, profile: string): Promise<string | null> {
  try {
    await execAsync(
      `docker compose -f ${composeFile} --profile ${profile} up -d`,
      { timeout: 60000 },
    );
    return null;
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
}

async function composeDown(composeFile: string, profile: string): Promise<void> {
  try {
    await execAsync(
      `docker compose -f ${composeFile} --profile ${profile} down`,
      { timeout: 30000 },
    );
  } catch {
    /* best-effort */
  }
}

/**
 * Handle a stage-signal IPC message from AIOO.
 */
export async function handleStageSignal(
  envelope: StageEnvelope,
  workspaceRoot: string,
): Promise<void> {
  const signal = envelope.payload as unknown as StageSignal;
  const start = Date.now();
  const ackBase = {
    entity: signal.entity, app: signal.app,
    fromStage: signal.fromStage, toStage: signal.toStage,
  };

  const error = validateSignal(envelope, signal);
  if (error === 'non-aioo-source') {
    logger.warn({ from: envelope.from }, 'Stage signal from non-AIOO rejected');
    return;
  }
  if (error) {
    await sendAck(workspaceRoot, signal.entity, 'failed', ackBase, start, error, envelope.id);
    return;
  }

  await executeTransition(workspaceRoot, signal, ackBase, start, envelope.id);
}

async function executeTransition(
  workspaceRoot: string,
  signal: StageSignal,
  ackBase: Record<string, unknown>,
  start: number,
  replyTo: string,
): Promise<void> {
  const composeFile = path.join(workspaceRoot, 'docker-compose.yml');
  const toProfile = `${signal.app}-app-${signal.toStage}`;
  const toContainer = `${signal.app}-app-${signal.toStage}`;

  logger.info(
    { entity: signal.entity, app: signal.app, from: signal.fromStage, to: signal.toStage },
    'Stage transition starting',
  );

  const upError = await composeUp(composeFile, toProfile);
  if (upError) {
    await sendAck(workspaceRoot, signal.entity, 'failed', ackBase, start,
      `Failed to start ${toProfile}: ${upError}`, replyTo);
    return;
  }

  const healthy = await waitForHealthy(toContainer, STAGE_HEALTH_CHECK_TIMEOUT, STAGE_HEALTH_CHECK_INTERVAL);
  if (!healthy) {
    logger.warn({ container: toContainer }, 'New stage failed health check, rolling back');
    await composeDown(composeFile, toProfile);
    await sendAck(workspaceRoot, signal.entity, 'failed', ackBase, start,
      `New stage ${toContainer} failed health check within ${STAGE_HEALTH_CHECK_TIMEOUT}ms`, replyTo);
    return;
  }

  await composeDown(composeFile, `${signal.app}-app-${signal.fromStage}`);
  logTransition(workspaceRoot, signal, Date.now() - start);
  await sendAck(workspaceRoot, signal.entity, 'success', ackBase, start, null, replyTo);

  logger.info(
    { entity: signal.entity, app: signal.app, from: signal.fromStage, to: signal.toStage, duration: Date.now() - start },
    'Stage transition complete',
  );
}
