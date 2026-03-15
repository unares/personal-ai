'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { createLogger } = require('../src/logger');

const brainClient = require('../src/aioo-brain-client');

function makeTmpCtx(envOverride = {}, configOverride = {}) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aioo-brain-test-'));

  const savedEnv = {};
  for (const [k, v] of Object.entries(envOverride)) {
    savedEnv[k] = process.env[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }

  const tracked = [];
  return {
    ctx: {
      entity: 'test',
      config: {
        brainModel: 'gemini-planning',
        brainClassifierModel: 'gemini-classifier',
        ...configOverride,
      },
      vaultDir: tmp,
      log: createLogger('test'),
      cost: { track: (source, tokens) => tracked.push({ source, tokens }) }
    },
    tracked,
    tmp,
    restore: () => {
      for (const [k, v] of Object.entries(savedEnv)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    }
  };
}

function createIdentityDir(tmp) {
  const identityDir = path.join(tmp, 'identity');
  const vaultDir = path.join(tmp, 'vault');
  fs.mkdirSync(identityDir, { recursive: true });
  fs.mkdirSync(vaultDir, { recursive: true });
  return { identityDir, vaultDir };
}

function writeIdentityFiles(identityDir, vaultDir, entity, overrides = {}) {
  const defaults = {
    SOUL: '# SOUL\nShared personality anchor.',
    IDENTITY: '# AIOO Identity\nOperational brain.',
    NORTHSTAR: `# ${entity.toUpperCase()} NORTHSTAR\nVision.`,
    GLOSSARY: `# ${entity.toUpperCase()} GLOSSARY\nTerms.`,
    CLAUDE: '# AIOO CLAUDE.md\nOperational context.',
  };
  const content = { ...defaults, ...overrides };

  if (content.SOUL !== null) {
    fs.writeFileSync(path.join(identityDir, 'SOUL.md'), content.SOUL);
  }
  if (content.IDENTITY !== null) {
    fs.writeFileSync(path.join(identityDir, 'AIOO_IDENTITY.md'), content.IDENTITY);
  }
  if (content.NORTHSTAR !== null) {
    fs.writeFileSync(path.join(vaultDir, `${entity.toUpperCase()}_NORTHSTAR.md`), content.NORTHSTAR);
  }
  if (content.GLOSSARY !== null) {
    fs.writeFileSync(path.join(vaultDir, `${entity.toUpperCase()}_GLOSSARY.md`), content.GLOSSARY);
  }
  if (content.CLAUDE !== null) {
    fs.writeFileSync(path.join(identityDir, 'CLAUDE.md'), content.CLAUDE);
  }
}

function patchPaths(identityDir, vaultDir) {
  const origPaths = brainClient._IDENTITY_FILES.map(f => ({
    path: f.path,
    pathFn: f.pathFn,
  }));

  brainClient._IDENTITY_FILES[0].path = path.join(identityDir, 'SOUL.md');
  brainClient._IDENTITY_FILES[1].path = path.join(identityDir, 'AIOO_IDENTITY.md');
  brainClient._IDENTITY_FILES[2].pathFn = (e) => path.join(vaultDir, `${e.toUpperCase()}_NORTHSTAR.md`);
  brainClient._IDENTITY_FILES[3].pathFn = (e) => path.join(vaultDir, `${e.toUpperCase()}_GLOSSARY.md`);
  brainClient._IDENTITY_FILES[4].path = path.join(identityDir, 'CLAUDE.md');

  return () => {
    brainClient._IDENTITY_FILES[0].path = origPaths[0].path;
    brainClient._IDENTITY_FILES[1].path = origPaths[1].path;
    brainClient._IDENTITY_FILES[2].pathFn = origPaths[2].pathFn;
    brainClient._IDENTITY_FILES[3].pathFn = origPaths[3].pathFn;
    brainClient._IDENTITY_FILES[4].path = origPaths[4].path;
  };
}

function cleanup(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

module.exports = {
  makeTmpCtx,
  createIdentityDir,
  writeIdentityFiles,
  patchPaths,
  cleanup,
  brainClient,
  createLogger,
};
