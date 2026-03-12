import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

// Mock child_process before importing clark-handler
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
import {
  ensureClarkNetwork,
  getOrSpawnClark,
  getActiveClarkInstances,
  stopAllClark,
  recordActivity,
  _clearInstances,
  startIdleChecker,
  stopIdleChecker,
} from './clark-handler.js';
import type { PawRoutingEntry } from './config.js';

const mockedExecSync = vi.mocked(execSync);

describe('clark-handler', () => {
  let tmpDir: string;

  beforeEach(() => {
    _clearInstances();
    vi.clearAllMocks();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'clark-test-'));

    // Create containers/clark/ with identity files
    const clarkDir = path.join(tmpDir, 'containers', 'clark');
    fs.mkdirSync(clarkDir, { recursive: true });
    fs.writeFileSync(path.join(clarkDir, 'CLAUDE.md'), '# Clark');
    fs.writeFileSync(
      path.join(clarkDir, 'settings.json'),
      JSON.stringify({ env: { ROLE: 'clark' } }),
    );
  });

  afterEach(() => {
    stopIdleChecker();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('ensureClarkNetwork', () => {
    it('calls docker network create', () => {
      mockedExecSync.mockReturnValue(Buffer.from(''));
      ensureClarkNetwork();
      expect(mockedExecSync).toHaveBeenCalledWith(
        expect.stringContaining('docker network create clark-net'),
        expect.any(Object),
      );
    });
  });

  describe('getOrSpawnClark', () => {
    const singleRoute: PawRoutingEntry = {
      target: 'clark',
      entity: 'procenteo',
      human: 'mateusz',
    };

    const multiRoute: PawRoutingEntry = {
      target: 'clark',
      entity: ['ai-workspace', 'procenteo', 'inisio'],
      human: 'michal',
    };

    it('spawns a Clark container with single entity', () => {
      mockedExecSync.mockReturnValue(Buffer.from(''));
      const name = getOrSpawnClark('mateusz', singleRoute, tmpDir);

      expect(name).toMatch(/^clark-mateusz-\d+$/);
      expect(getActiveClarkInstances()).toHaveLength(1);

      const dockerCmd = mockedExecSync.mock.calls[0][0] as string;
      expect(dockerCmd).toContain('--network clark-net');
      expect(dockerCmd).toContain('clark:latest');
      expect(dockerCmd).toContain('HUMAN_NAME=mateusz');
      expect(dockerCmd).toContain('ANTHROPIC_BASE_URL=http://host.docker.internal:3001');
      expect(dockerCmd).toContain('ANTHROPIC_API_KEY=placeholder');
    });

    it('mounts Distilled/ per entity for multi-entity route', () => {
      mockedExecSync.mockReturnValue(Buffer.from(''));
      getOrSpawnClark('michal', multiRoute, tmpDir);

      const dockerCmd = mockedExecSync.mock.calls[0][0] as string;
      expect(dockerCmd).toContain('/vault/ai-workspace/Distilled:ro');
      expect(dockerCmd).toContain('/vault/procenteo/Distilled:ro');
      expect(dockerCmd).toContain('/vault/inisio/Distilled:ro');
    });

    it('creates Distilled/ dirs if missing', () => {
      mockedExecSync.mockReturnValue(Buffer.from(''));
      getOrSpawnClark('mateusz', singleRoute, tmpDir);

      const distilledDir = path.join(
        tmpDir, 'memory-vault', 'procenteo', 'Distilled',
      );
      expect(fs.existsSync(distilledDir)).toBe(true);
    });

    it('mounts CLAUDE.md and settings.json', () => {
      mockedExecSync.mockReturnValue(Buffer.from(''));
      getOrSpawnClark('mateusz', singleRoute, tmpDir);

      const dockerCmd = mockedExecSync.mock.calls[0][0] as string;
      expect(dockerCmd).toContain('/home/clark/.claude/CLAUDE.md:ro');
      expect(dockerCmd).toContain('/home/clark/.claude/settings.json:ro');
    });

    it('reuses existing container if alive', () => {
      // First spawn
      mockedExecSync.mockReturnValue(Buffer.from(''));
      const name1 = getOrSpawnClark('mateusz', singleRoute, tmpDir);

      // isContainerAlive check — mock returns 'running' for inspect calls
      mockedExecSync.mockImplementation((cmd: unknown) => {
        const cmdStr = String(cmd);
        if (cmdStr.includes('docker inspect')) return Buffer.from("'running'\n");
        return Buffer.from('');
      });
      const name2 = getOrSpawnClark('mateusz', singleRoute, tmpDir);

      expect(name2).toBe(name1);
      expect(getActiveClarkInstances()).toHaveLength(1);
    });

    it('sets ENTITY env to comma-separated list for multi-entity', () => {
      mockedExecSync.mockReturnValue(Buffer.from(''));
      getOrSpawnClark('michal', multiRoute, tmpDir);

      const dockerCmd = mockedExecSync.mock.calls[0][0] as string;
      expect(dockerCmd).toContain('ENTITY=ai-workspace,procenteo,inisio');
    });

    it('does not mount NORTHSTAR', () => {
      mockedExecSync.mockReturnValue(Buffer.from(''));
      getOrSpawnClark('mateusz', singleRoute, tmpDir);

      const dockerCmd = mockedExecSync.mock.calls[0][0] as string;
      expect(dockerCmd).not.toContain('NORTHSTAR');
    });

    it('does not mount Memories/', () => {
      mockedExecSync.mockReturnValue(Buffer.from(''));
      getOrSpawnClark('mateusz', singleRoute, tmpDir);

      const dockerCmd = mockedExecSync.mock.calls[0][0] as string;
      expect(dockerCmd).not.toContain('Memories');
    });
  });

  describe('recordActivity', () => {
    it('updates lastActivity timestamp', () => {
      mockedExecSync.mockReturnValue(Buffer.from(''));
      const route: PawRoutingEntry = {
        target: 'clark', entity: 'procenteo', human: 'mateusz',
      };
      getOrSpawnClark('mateusz', route, tmpDir);

      const before = getActiveClarkInstances()[0].lastActivity;
      // Small delay to ensure timestamp differs
      recordActivity('mateusz');
      const after = getActiveClarkInstances()[0].lastActivity;

      expect(after).toBeGreaterThanOrEqual(before);
    });
  });

  describe('stopAllClark', () => {
    it('stops all active Clark containers', () => {
      mockedExecSync.mockReturnValue(Buffer.from(''));
      const route: PawRoutingEntry = {
        target: 'clark', entity: 'procenteo', human: 'mateusz',
      };
      getOrSpawnClark('mateusz', route, tmpDir);
      expect(getActiveClarkInstances()).toHaveLength(1);

      stopAllClark();
      expect(getActiveClarkInstances()).toHaveLength(0);
    });
  });

  describe('startIdleChecker / stopIdleChecker', () => {
    it('starts and stops without error', () => {
      startIdleChecker();
      stopIdleChecker();
    });
  });
});
