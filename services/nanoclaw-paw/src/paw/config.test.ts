import { describe, it, expect } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

import { discoverEntities, loadRoutingConfig } from './config.js';

describe('config', () => {
  it('discovers entities from ipc directories', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'paw-test-'));
    const ipcDir = path.join(tmpDir, 'ipc');
    fs.mkdirSync(path.join(ipcDir, 'aioo-procenteo'), { recursive: true });
    fs.mkdirSync(path.join(ipcDir, 'aioo-inisio'), { recursive: true });
    fs.mkdirSync(path.join(ipcDir, 'watchdog'), { recursive: true });

    const entities = discoverEntities(tmpDir);
    expect(entities).toContain('procenteo');
    expect(entities).toContain('inisio');
    expect(entities).not.toContain('watchdog');

    fs.rmSync(tmpDir, { recursive: true });
  });

  it('returns empty array when ipc dir missing', () => {
    const entities = discoverEntities('/nonexistent');
    expect(entities).toEqual([]);
  });

  it('loads routing config from file', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'paw-test-'));
    const configDir = path.join(tmpDir, 'nanoclaw-config');
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(
      path.join(configDir, 'routing.json'),
      JSON.stringify({
        routes: {
          'clark-michal': { target: 'clark', entity: 'ai-workspace', human: 'michal' },
        },
      }),
    );

    const config = loadRoutingConfig(tmpDir);
    expect(config.routes['clark-michal']).toBeDefined();
    expect(config.routes['clark-michal'].target).toBe('clark');

    fs.rmSync(tmpDir, { recursive: true });
  });

  it('returns empty config when file missing', () => {
    const config = loadRoutingConfig('/nonexistent', true);
    expect(config.routes).toEqual({});
  });
});
