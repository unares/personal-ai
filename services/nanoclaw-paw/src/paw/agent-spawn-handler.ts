/**
 * Agent Spawn Handler for NanoClaw-PAW.
 *
 * Receives spawn-agent IPC from AIOO, executes Claude Code CLI
 * inside stage containers via docker exec, returns agent-report.
 *
 * Decision P2: docker exec {stage-container} claude -p "{task}"
 */
import { exec } from 'child_process';
import { promisify } from 'util';

import { logger } from '../logger.js';
import { getStageContainer } from './persistent-registry.js';
import { writeToAioo } from './ipc-poller.js';

const execAsync = promisify(exec);

const AGENT_TIMEOUT = parseInt(
  process.env.PAW_AGENT_TIMEOUT || '600000',
  10,
);

interface SpawnAgentSignal {
  task: string;
  stage: string;
  context: string;
  model: string;
}

interface SpawnEnvelope {
  id: string;
  type: string;
  from: string;
  payload: Record<string, unknown>;
}

function extractEntity(from: string): string | null {
  return from.startsWith('aioo-') ? from.slice(5) : null;
}

function buildExecCommand(containerName: string, signal: SpawnAgentSignal): string {
  const escapedTask = signal.task.replace(/'/g, "'\\''");
  const modelFlag = signal.model ? `--model ${signal.model}` : '';
  return `docker exec ${containerName} claude -p '${escapedTask}' ${modelFlag} --output-format json`;
}

function parseAgentOutput(stdout: string): { result: string; tokens: number } {
  try {
    const parsed = JSON.parse(stdout.trim());
    return {
      result: parsed.result || stdout.trim(),
      tokens: parsed.usage?.total_tokens || 0,
    };
  } catch {
    return { result: stdout.trim(), tokens: 0 };
  }
}

async function sendReport(
  workspaceRoot: string,
  entity: string,
  status: string,
  result: string | null,
  tokens: number,
  start: number,
  error: string | null,
  replyTo: string,
): Promise<void> {
  await writeToAioo(workspaceRoot, entity, 'agent-report', {
    status, result, tokens,
    duration: `${Date.now() - start}ms`, error,
  }, replyTo);
}

/**
 * Handle a spawn-agent IPC message from AIOO.
 */
export async function handleSpawnAgent(
  envelope: SpawnEnvelope,
  workspaceRoot: string,
): Promise<void> {
  const signal = envelope.payload as unknown as SpawnAgentSignal;
  const start = Date.now();
  const entity = extractEntity(envelope.from);

  if (!entity) {
    logger.warn({ from: envelope.from }, 'Spawn-agent from non-AIOO rejected');
    return;
  }

  const container = getStageContainer(entity, signal.stage);
  if (!container) {
    await sendReport(workspaceRoot, entity, 'failed', null, 0, start,
      `Stage container ${entity}-app-${signal.stage} not found`, envelope.id);
    return;
  }

  logger.info({ entity, stage: signal.stage, container: container.name }, 'Spawning agent');

  try {
    const { stdout } = await execAsync(
      buildExecCommand(container.name, signal),
      { timeout: AGENT_TIMEOUT },
    );
    const { result, tokens } = parseAgentOutput(stdout);
    await sendReport(workspaceRoot, entity, 'completed', result, tokens, start, null, envelope.id);
    logger.info({ entity, stage: signal.stage, duration: Date.now() - start }, 'Agent completed');
  } catch (err) {
    const isTimeout = err instanceof Error && 'killed' in err;
    await sendReport(workspaceRoot, entity, isTimeout ? 'timeout' : 'failed',
      null, 0, start, err instanceof Error ? err.message : String(err), envelope.id);
    logger.error({ entity, stage: signal.stage, err }, 'Agent execution failed');
  }
}
