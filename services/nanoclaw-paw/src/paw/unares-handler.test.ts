import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

// Mock child_process before importing handler
vi.mock('child_process', () => ({
  execSync: vi.fn(),
}));

// Mock logger
vi.mock('../logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { execSync } from 'child_process';
import { buildUnaresArgs, getOrSpawnUnares, sendToUnares } from './unares-handler.js';
import {
  getActiveInstances,
  _clearInstances,
  stopIdleChecker,
} from './ephemeral-companion.js';

const mockedExecSync = vi.mocked(execSync);

describe('unares-handler', () => {
  let tmpDir: string;

  beforeEach(() => {
    _clearInstances();
    vi.clearAllMocks();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'unares-test-'));

    // Create containers/unares/ with identity files
    const unaresDir = path.join(tmpDir, 'containers', 'unares');
    fs.mkdirSync(unaresDir, { recursive: true });
    fs.writeFileSync(path.join(unaresDir, 'CLAUDE.md'), '# Unares');
    fs.writeFileSync(
      path.join(unaresDir, 'settings.json'),
      JSON.stringify({ env: { ROLE: 'unares' } }),
    );

    // Create memory-vault/
    const vaultDir = path.join(tmpDir, 'memory-vault');
    fs.mkdirSync(vaultDir, { recursive: true });

    // Create ipc/
    const ipcDir = path.join(tmpDir, 'ipc');
    fs.mkdirSync(ipcDir, { recursive: true });

    // Create nanoclaw-config/
    const configDir = path.join(tmpDir, 'nanoclaw-config');
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(path.join(configDir, 'routing.json'), '{}');
  });

  afterEach(() => {
    stopIdleChecker();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('buildUnaresArgs', () => {
    it('T1: uses ephemeral-companion:latest image', () => {
      const args = buildUnaresArgs('unares-123', tmpDir);
      expect(args).toContain('ephemeral-companion:latest');
    });

    it('T2: mounts memory-vault/ at /vault/ read-only', () => {
      const args = buildUnaresArgs('unares-123', tmpDir);
      const vaultMount = args.find((a) => a.includes('/vault:ro'));
      expect(vaultMount).toBeDefined();
    });

    it('T3: mounts ipc/ at /ipc/ read-only', () => {
      const args = buildUnaresArgs('unares-123', tmpDir);
      const ipcMount = args.find((a) => a.includes('/ipc:ro'));
      expect(ipcMount).toBeDefined();
    });

    it('T4: mounts logs/ at /logs/ read-only when present', () => {
      const logsDir = path.join(tmpDir, 'logs');
      fs.mkdirSync(logsDir, { recursive: true });

      const args = buildUnaresArgs('unares-123', tmpDir);
      const logsMount = args.find((a) => a.includes('/logs:ro'));
      expect(logsMount).toBeDefined();
    });

    it('T5: mounts routing.json at /config/routing.json ro', () => {
      const args = buildUnaresArgs('unares-123', tmpDir);
      const routeMount = args.find((a) => a.includes('/config/routing.json:ro'));
      expect(routeMount).toBeDefined();
    });

    it('T6: uses ephemeral-companion-net network', () => {
      const args = buildUnaresArgs('unares-123', tmpDir);
      const netIdx = args.indexOf('--network');
      expect(args[netIdx + 1]).toBe('ephemeral-companion-net');
    });

    it('T7: does NOT mount ai-gateway config dirs', () => {
      const args = buildUnaresArgs('unares-123', tmpDir);
      const joined = args.join(' ');
      expect(joined).not.toContain('ai-gateway');
    });

    it('T8: container name format is unares-{ts}', () => {
      const args = buildUnaresArgs('unares-1710000000', tmpDir);
      const nameIdx = args.indexOf('--name');
      expect(args[nameIdx + 1]).toBe('unares-1710000000');
    });

    it('sets ROLE=unares env', () => {
      const args = buildUnaresArgs('unares-123', tmpDir);
      expect(args).toContain('ROLE=unares');
    });

    it('sets HUMAN_NAME=michal env', () => {
      const args = buildUnaresArgs('unares-123', tmpDir);
      expect(args).toContain('HUMAN_NAME=michal');
    });
  });

  describe('getOrSpawnUnares', () => {
    it('spawns Unares container', () => {
      mockedExecSync.mockReturnValue(Buffer.from(''));
      const name = getOrSpawnUnares(tmpDir);

      expect(name).toMatch(/^unares-\d+$/);
      expect(getActiveInstances()).toHaveLength(1);
      expect(getActiveInstances()[0].role).toBe('unares');
    });

    it('reuses existing container if alive', () => {
      mockedExecSync.mockReturnValue(Buffer.from(''));
      const name1 = getOrSpawnUnares(tmpDir);

      mockedExecSync.mockImplementation((cmd: unknown) => {
        const cmdStr = String(cmd);
        if (cmdStr.includes('docker inspect')) return Buffer.from("running\n");
        return Buffer.from('');
      });
      const name2 = getOrSpawnUnares(tmpDir);

      expect(name2).toBe(name1);
      expect(getActiveInstances()).toHaveLength(1);
    });
  });

  describe('sendToUnares', () => {
    it('executes claude in container and returns output', async () => {
      // Pre-spawn the container so sendToUnares just does docker exec
      mockedExecSync.mockReturnValue(Buffer.from(''));
      getOrSpawnUnares(tmpDir);

      // Mock returns strings (encoding: 'utf-8' specified in exec calls)
      mockedExecSync.mockImplementation((cmd: unknown) => {
        const cmdStr = String(cmd);
        if (cmdStr.includes('docker inspect')) return "running\n";
        if (cmdStr.includes('docker exec')) return 'System OK\n';
        return '';
      });

      const result = await sendToUnares('status', tmpDir);
      expect(result).toBe('System OK');
    });

    it('returns unavailable message on exec failure', async () => {
      mockedExecSync.mockImplementation((cmd: unknown) => {
        const cmdStr = String(cmd);
        if (cmdStr.includes('docker exec')) throw new Error('exec failed');
        if (cmdStr.includes('docker inspect')) return Buffer.from("running\n");
        return Buffer.from('');
      });

      const result = await sendToUnares('status', tmpDir);
      expect(result).toBe('Unares is unavailable');
    });
  });

  describe('identity verification', () => {
    it('T12: Unares CLAUDE.md has @-import for SOUL.md', () => {
      const claudeMd = fs.readFileSync(
        path.resolve(__dirname, '../../../../containers/unares/CLAUDE.md'),
        'utf-8',
      );
      expect(claudeMd).toContain('@/vault/SOUL.md');
    });

    it('T13: Unares CLAUDE.md has @-import for UNARES_IDENTITY.md', () => {
      const claudeMd = fs.readFileSync(
        path.resolve(__dirname, '../../../../containers/unares/CLAUDE.md'),
        'utf-8',
      );
      expect(claudeMd).toContain('@/vault/UNARES_IDENTITY.md');
    });

    it('T14: Unares settings.json has read-only permissions', () => {
      const settings = JSON.parse(
        fs.readFileSync(
          path.resolve(__dirname, '../../../../containers/unares/settings.json'),
          'utf-8',
        ),
      );
      expect(settings.permissions.deny).toContain('Edit(**)');
      expect(settings.permissions.deny).toContain('Write(**)');
      expect(settings.permissions.deny).toContain('Bash(docker*)');
    });
  });
});
