import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as child_process from 'child_process';
import fs from 'fs';

// Mock child_process and fs
vi.mock('child_process', async () => {
  const actual = await vi.importActual('child_process');
  return {
    ...actual,
    execSync: vi.fn(),
    exec: vi.fn(),
  };
});

vi.mock('./ipc-poller.js', () => ({
  writeToAioo: vi.fn().mockResolvedValue('msg-test.json'),
}));

const { handleStageSignal } = await import('./stage-handler.js');
const { writeToAioo } = await import('./ipc-poller.js');

function makeEnvelope(
  from: string,
  payload: Record<string, unknown>,
): { id: string; type: string; from: string; payload: Record<string, unknown> } {
  return {
    id: 'test-id-1',
    type: 'stage-signal',
    from,
    payload,
  };
}

describe('stage-handler', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    // Default: container running
    vi.mocked(child_process.execSync).mockImplementation((cmd: string) => {
      if (typeof cmd === 'string' && cmd.includes('State.Status')) return 'running';
      if (typeof cmd === 'string' && cmd.includes('Health.Status')) return 'healthy';
      if (typeof cmd === 'string' && cmd.includes('Health}}yes')) return 'yes';
      return '';
    });
    // Default: exec succeeds
    vi.mocked(child_process.exec).mockImplementation(
      ((_cmd: string, _opts: unknown, cb?: (err: Error | null, result: { stdout: string; stderr: string }) => void) => {
        if (cb) cb(null, { stdout: '', stderr: '' });
        return {} as child_process.ChildProcess;
      }) as typeof child_process.exec,
    );
  });

  it('rejects signal from non-AIOO source', async () => {
    const envelope = makeEnvelope('clark-michal', {
      entity: 'procenteo',
      app: 'procenteo',
      fromStage: 'demo',
      toStage: 'testing',
    });

    await handleStageSignal(envelope, '/workspace');
    expect(writeToAioo).not.toHaveBeenCalled();
  });

  it('rejects entity mismatch', async () => {
    const envelope = makeEnvelope('aioo-inisio', {
      entity: 'procenteo',
      app: 'procenteo',
      fromStage: 'demo',
      toStage: 'testing',
    });

    await handleStageSignal(envelope, '/workspace');
    expect(writeToAioo).toHaveBeenCalledWith(
      '/workspace', 'procenteo', 'stage-ack',
      expect.objectContaining({ status: 'failed' }),
      'test-id-1',
    );
  });

  it('rejects invalid stage names', async () => {
    const envelope = makeEnvelope('aioo-procenteo', {
      entity: 'procenteo',
      app: 'procenteo',
      fromStage: 'demo',
      toStage: 'production',
    });

    await handleStageSignal(envelope, '/workspace');
    expect(writeToAioo).toHaveBeenCalledWith(
      '/workspace', 'procenteo', 'stage-ack',
      expect.objectContaining({
        status: 'failed',
        reason: expect.stringContaining('Invalid stage'),
      }),
      'test-id-1',
    );
  });

  it('rejects invalid progression (demo to launch)', async () => {
    const envelope = makeEnvelope('aioo-procenteo', {
      entity: 'procenteo',
      app: 'procenteo',
      fromStage: 'demo',
      toStage: 'launch',
    });

    await handleStageSignal(envelope, '/workspace');
    expect(writeToAioo).toHaveBeenCalledWith(
      '/workspace', 'procenteo', 'stage-ack',
      expect.objectContaining({
        status: 'failed',
        reason: expect.stringContaining('Invalid progression'),
      }),
      'test-id-1',
    );
  });

  it('rejects when from-stage container is not running', async () => {
    vi.mocked(child_process.execSync).mockImplementation((cmd: string) => {
      if (typeof cmd === 'string' && cmd.includes('State.Status')) return 'exited';
      return '';
    });

    const envelope = makeEnvelope('aioo-procenteo', {
      entity: 'procenteo',
      app: 'procenteo',
      fromStage: 'demo',
      toStage: 'testing',
    });

    await handleStageSignal(envelope, '/workspace');
    expect(writeToAioo).toHaveBeenCalledWith(
      '/workspace', 'procenteo', 'stage-ack',
      expect.objectContaining({
        status: 'failed',
        reason: expect.stringContaining('not running'),
      }),
      'test-id-1',
    );
  });
});
