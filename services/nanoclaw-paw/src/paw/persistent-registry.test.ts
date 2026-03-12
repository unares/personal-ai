import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as child_process from 'child_process';

// Mock execSync before importing the module
vi.mock('child_process', async () => {
  const actual = await vi.importActual('child_process');
  return { ...actual, execSync: vi.fn() };
});

const { refreshRegistry, getAiooContainer, getStageContainer, getAllPersistent, isPersistentContainer, _clearRegistry } = await import('./persistent-registry.js');

describe('persistent-registry', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    _clearRegistry();
  });

  it('populates registry from docker ps output', () => {
    vi.mocked(child_process.execSync).mockReturnValue(
      'aioo-procenteo\naioo-inisio\nprocenteo-app-demo\nchronicle\n',
    );

    refreshRegistry('/workspace');

    expect(getAiooContainer('procenteo')).toBeDefined();
    expect(getAiooContainer('procenteo')!.entity).toBe('procenteo');
    expect(getAiooContainer('procenteo')!.type).toBe('aioo');
    expect(getAiooContainer('procenteo')!.ipcDir).toBe(
      '/workspace/ipc/aioo-procenteo/from-paw',
    );

    expect(getAiooContainer('inisio')).toBeDefined();
    expect(getStageContainer('procenteo', 'demo')).toBeDefined();
    expect(getStageContainer('procenteo', 'demo')!.type).toBe('stage');

    // chronicle is not a PAW container
    expect(isPersistentContainer('chronicle')).toBe(false);
  });

  it('removes containers that are no longer running', () => {
    vi.mocked(child_process.execSync).mockReturnValue(
      'aioo-procenteo\naioo-inisio\n',
    );
    refreshRegistry('/workspace');
    expect(getAllPersistent()).toHaveLength(2);

    // Next refresh — only procenteo running
    vi.mocked(child_process.execSync).mockReturnValue('aioo-procenteo\n');
    refreshRegistry('/workspace');
    expect(getAllPersistent()).toHaveLength(1);
    expect(getAiooContainer('inisio')).toBeUndefined();
  });

  it('handles empty docker ps output', () => {
    vi.mocked(child_process.execSync).mockReturnValue('');
    refreshRegistry('/workspace');
    expect(getAllPersistent()).toHaveLength(0);
  });

  it('handles docker ps failure gracefully', () => {
    vi.mocked(child_process.execSync).mockImplementation(() => {
      throw new Error('Docker not running');
    });
    // Should not throw
    refreshRegistry('/workspace');
    expect(getAllPersistent()).toHaveLength(0);
  });

  it('parses stage container names correctly', () => {
    vi.mocked(child_process.execSync).mockReturnValue(
      'procenteo-app-demo\nprocenteo-app-testing\ninisio-app-launch\ninisio-app-scaling\n',
    );
    refreshRegistry('/workspace');

    expect(getStageContainer('procenteo', 'demo')).toBeDefined();
    expect(getStageContainer('procenteo', 'testing')).toBeDefined();
    expect(getStageContainer('inisio', 'launch')).toBeDefined();
    expect(getStageContainer('inisio', 'scaling')).toBeDefined();
    expect(getStageContainer('procenteo', 'launch')).toBeUndefined();
  });
});
