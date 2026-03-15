import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

// Mock child_process before importing handlers
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
import { getOrSpawnClark, recordActivity } from './clark-handler.js';
import {
  ensureEphemeralCompanionNetwork,
  getActiveInstances,
  stopAllCompanions,
  startIdleChecker,
  stopIdleChecker,
  _clearInstances,
} from './ephemeral-companion.js';
import type { PawRoutingEntry } from './config.js';

const mockedExecSync = vi.mocked(execSync);

describe('ephemeral-companion shared', () => {
  beforeEach(() => {
    _clearInstances();
    vi.clearAllMocks();
  });

  afterEach(() => {
    stopIdleChecker();
  });

  it('ensureEphemeralCompanionNetwork calls docker network create', () => {
    mockedExecSync.mockReturnValue(Buffer.from(''));
    ensureEphemeralCompanionNetwork();
    expect(mockedExecSync).toHaveBeenCalledWith(
      expect.stringContaining('docker network create ephemeral-companion-net'),
      expect.any(Object),
    );
  });

  it('startIdleChecker / stopIdleChecker run without error', () => {
    startIdleChecker();
    stopIdleChecker();
  });
});

describe('clark-handler', () => {
  let tmpDir: string;

  beforeEach(() => {
    _clearInstances();
    vi.clearAllMocks();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'clark-test-'));

    // Create containers/ephemeral-companion/ with identity files
    const companionDir = path.join(tmpDir, 'containers', 'ephemeral-companion');
    fs.mkdirSync(companionDir, { recursive: true });
    fs.writeFileSync(path.join(companionDir, 'CLAUDE.md'), '# Clark');
    fs.writeFileSync(
      path.join(companionDir, 'settings.json'),
      JSON.stringify({ env: { ROLE: 'clark' } }),
    );
  });

  afterEach(() => {
    stopIdleChecker();
    fs.rmSync(tmpDir, { recursive: true, force: true });
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
      expect(getActiveInstances()).toHaveLength(1);

      const dockerCmd = mockedExecSync.mock.calls[0][0] as string;
      expect(dockerCmd).toContain('--network ephemeral-companion-net');
      expect(dockerCmd).toContain('ephemeral-companion:latest');
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
      mockedExecSync.mockReturnValue(Buffer.from(''));
      const name1 = getOrSpawnClark('mateusz', singleRoute, tmpDir);

      mockedExecSync.mockImplementation((cmd: unknown) => {
        const cmdStr = String(cmd);
        if (cmdStr.includes('docker inspect')) return Buffer.from("'running'\n");
        return Buffer.from('');
      });
      const name2 = getOrSpawnClark('mateusz', singleRoute, tmpDir);

      expect(name2).toBe(name1);
      expect(getActiveInstances()).toHaveLength(1);
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

    it('mounts SOUL.md when present', () => {
      const vaultDir = path.join(tmpDir, 'memory-vault');
      fs.mkdirSync(vaultDir, { recursive: true });
      fs.writeFileSync(path.join(vaultDir, 'SOUL.md'), '# SOUL');

      mockedExecSync.mockReturnValue(Buffer.from(''));
      getOrSpawnClark('mateusz', singleRoute, tmpDir);

      const dockerCmd = mockedExecSync.mock.calls[0][0] as string;
      expect(dockerCmd).toContain('/vault/SOUL.md:ro');
    });

    it('mounts CLARK_IDENTITY.md when present', () => {
      const vaultDir = path.join(tmpDir, 'memory-vault');
      fs.mkdirSync(vaultDir, { recursive: true });
      fs.writeFileSync(path.join(vaultDir, 'CLARK_IDENTITY.md'), '# Clark Identity');

      mockedExecSync.mockReturnValue(Buffer.from(''));
      getOrSpawnClark('mateusz', singleRoute, tmpDir);

      const dockerCmd = mockedExecSync.mock.calls[0][0] as string;
      expect(dockerCmd).toContain('/vault/CLARK_IDENTITY.md:ro');
    });

    it('skips identity mounts when files missing', () => {
      mockedExecSync.mockReturnValue(Buffer.from(''));
      getOrSpawnClark('mateusz', singleRoute, tmpDir);

      const dockerCmd = mockedExecSync.mock.calls[0][0] as string;
      expect(dockerCmd).not.toContain('SOUL.md');
      expect(dockerCmd).not.toContain('CLARK_IDENTITY.md');
    });
  });

  describe('recordActivity', () => {
    it('updates lastActivity timestamp', () => {
      mockedExecSync.mockReturnValue(Buffer.from(''));
      const route: PawRoutingEntry = {
        target: 'clark', entity: 'procenteo', human: 'mateusz',
      };
      getOrSpawnClark('mateusz', route, tmpDir);

      const before = getActiveInstances()[0].lastActivity;
      recordActivity('mateusz');
      const after = getActiveInstances()[0].lastActivity;

      expect(after).toBeGreaterThanOrEqual(before);
    });
  });

  describe('stopAllCompanions', () => {
    it('stops all active companion containers', () => {
      mockedExecSync.mockReturnValue(Buffer.from(''));
      const route: PawRoutingEntry = {
        target: 'clark', entity: 'procenteo', human: 'mateusz',
      };
      getOrSpawnClark('mateusz', route, tmpDir);
      expect(getActiveInstances()).toHaveLength(1);

      stopAllCompanions();
      expect(getActiveInstances()).toHaveLength(0);
    });
  });
});
