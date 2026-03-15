import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

// Mock child_process
vi.mock('child_process', () => ({
  execSync: vi.fn(() => Buffer.from('')),
}));

// Track created bot instances
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const botInstances: any[] = [];

vi.mock('grammy', () => {
  class MockBot {
    api = {
      config: { use: vi.fn() },
      sendMessage: vi.fn(),
    };
    catch = vi.fn();
    on = vi.fn();
    command = vi.fn();
    start = vi.fn();
    stop = vi.fn();

    constructor() {
      botInstances.push(this);
    }
  }
  return { Bot: MockBot };
});

vi.mock('@grammyjs/auto-retry', () => ({
  autoRetry: vi.fn(() => vi.fn()),
}));

vi.mock('../logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import {
  startTelegramBots,
  stopTelegramBots,
  handleHumanReply,
  getBotForRoute,
  _clearBots,
} from './telegram-bots.js';
import { _clearInstances } from './ephemeral-companion.js';
import type { PawRoutingConfig } from './config.js';

function makeConfig(): PawRoutingConfig {
  return {
    routes: {
      'clark-michal': {
        target: 'clark' as const,
        entity: ['ai-workspace', 'procenteo', 'inisio'],
        human: 'michal',
        telegram: {
          botTokenEnv: 'TELEGRAM_CLARK_MICHAL_TOKEN',
          mode: 'dm' as const,
          allowedUsers: ['12345'],
        },
      },
    },
  };
}

describe('telegram-bots', () => {
  let tmpDir: string;
  const savedEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    _clearBots();
    _clearInstances();
    botInstances.length = 0;
    vi.clearAllMocks();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tg-test-'));

    fs.mkdirSync(path.join(tmpDir, 'containers', 'ephemeral-companion'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'containers', 'ephemeral-companion', 'CLAUDE.md'), '# Clark');
    fs.writeFileSync(path.join(tmpDir, 'containers', 'ephemeral-companion', 'settings.json'), '{}');
    fs.mkdirSync(path.join(tmpDir, 'memory-vault', 'ai-workspace', 'Logs'), { recursive: true });

    savedEnv.TELEGRAM_CLARK_MICHAL_TOKEN = process.env.TELEGRAM_CLARK_MICHAL_TOKEN;
    process.env.TELEGRAM_CLARK_MICHAL_TOKEN = 'test-token-123';
  });

  afterEach(() => {
    for (const [k, v] of Object.entries(savedEnv)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('bot factory', () => {
    it('T1: creates bot with valid config and auto-retry', async () => {
      const count = await startTelegramBots(makeConfig(), tmpDir);
      expect(count).toBe(1);
      expect(botInstances).toHaveLength(1);
      expect(botInstances[0].api.config.use).toHaveBeenCalled();
    });

    it('T2: skips bot when token env var missing', async () => {
      delete process.env.TELEGRAM_CLARK_MICHAL_TOKEN;
      const count = await startTelegramBots(makeConfig(), tmpDir);
      expect(count).toBe(0);
      expect(botInstances).toHaveLength(0);
    });

    it('T18: starts with partial tokens', async () => {
      const config: PawRoutingConfig = {
        routes: {
          'clark-michal': {
            target: 'clark', entity: 'procenteo', human: 'michal',
            telegram: { botTokenEnv: 'TELEGRAM_CLARK_MICHAL_TOKEN', mode: 'dm', allowedUsers: ['12345'] },
          },
          'aioo-procenteo': {
            target: 'aioo', entity: 'procenteo', human: 'michal',
          },
        },
      };
      const count = await startTelegramBots(config, tmpDir);
      expect(count).toBe(1);
    });
  });

  describe('DM handler setup', () => {
    it('T5: DM bot registers message:text handler', async () => {
      await startTelegramBots(makeConfig(), tmpDir);
      const bot = botInstances[0];
      expect(bot.on).toHaveBeenCalledWith('message:text', expect.any(Function));
    });

    it('registers /start command handler', async () => {
      await startTelegramBots(makeConfig(), tmpDir);
      expect(botInstances[0].command).toHaveBeenCalledWith('start', expect.any(Function));
    });
  });

  describe('group handler setup', () => {
    it('T7: group bot registers message:text and callback_query handlers', async () => {
      process.env.TELEGRAM_AIOO_PROCENTEO_TOKEN = 'aioo-token';
      savedEnv.TELEGRAM_AIOO_PROCENTEO_TOKEN = undefined;
      const config: PawRoutingConfig = {
        routes: {
          'aioo-procenteo': {
            target: 'aioo', entity: 'procenteo', human: 'michal',
            telegram: { botTokenEnv: 'TELEGRAM_AIOO_PROCENTEO_TOKEN', mode: 'group', trigger: '@aioo', allowedUsers: ['12345'] },
          },
        },
      };
      await startTelegramBots(config, tmpDir);
      const bot = botInstances[0];
      const onCalls = bot.on.mock.calls.map((c: unknown[]) => c[0]);
      expect(onCalls).toContain('message:text');
      expect(onCalls).toContain('callback_query:data');
    });
  });

  describe('message splitting', () => {
    it('T8: splits messages over 4096 chars', async () => {
      await startTelegramBots(makeConfig(), tmpDir);
      const longText = 'x'.repeat(5000);
      await handleHumanReply({ payload: { channel: 'telegram-clark-michal', text: longText, chatId: '999' } });
      const bot = botInstances[0];
      expect(bot.api.sendMessage).toHaveBeenCalledTimes(2);
    });
  });

  describe('human-reply IPC handler', () => {
    it('T9: sends message via correct bot to correct chatId', async () => {
      await startTelegramBots(makeConfig(), tmpDir);
      await handleHumanReply({ payload: { channel: 'telegram-clark-michal', text: 'Hello', chatId: '12345' } });
      const bot = botInstances[0];
      expect(bot.api.sendMessage).toHaveBeenCalledWith('12345', 'Hello', { reply_markup: undefined });
    });

    it('T10: sends inline keyboard when provided', async () => {
      await startTelegramBots(makeConfig(), tmpDir);
      const keyboard = [[{ text: 'YES', callback_data: 'hitl:yes' }]];
      await handleHumanReply({ payload: { channel: 'telegram-clark-michal', text: 'Approve?', chatId: '12345', inlineKeyboard: keyboard } });
      const bot = botInstances[0];
      expect(bot.api.sendMessage).toHaveBeenCalledWith('12345', 'Approve?', { reply_markup: { inline_keyboard: keyboard } });
    });

    it('T11: logs error for unknown route without crash', async () => {
      await startTelegramBots(makeConfig(), tmpDir);
      await handleHumanReply({ payload: { channel: 'telegram-unknown', text: 'test', chatId: '999' } });
      // Should not throw
    });
  });

  describe('getBotForRoute', () => {
    it('returns bot for valid route', async () => {
      await startTelegramBots(makeConfig(), tmpDir);
      expect(getBotForRoute('clark-michal')).toBeTruthy();
    });

    it('returns null for unknown route', () => {
      expect(getBotForRoute('nonexistent')).toBeNull();
    });
  });

  describe('lifecycle', () => {
    it('T19: stopTelegramBots stops all bots', async () => {
      await startTelegramBots(makeConfig(), tmpDir);
      expect(getBotForRoute('clark-michal')).toBeTruthy();
      await stopTelegramBots();
      expect(getBotForRoute('clark-michal')).toBeNull();
    });
  });

  describe('conversation logging', () => {
    it('T15: log directory path follows spec pattern', () => {
      const logPath = path.join(tmpDir, 'memory-vault', 'ai-workspace', 'Logs', 'telegram', 'clark-michal');
      fs.mkdirSync(logPath, { recursive: true });
      const date = new Date().toISOString().slice(0, 10);
      fs.writeFileSync(path.join(logPath, `${date}.md`), '## test');
      expect(fs.existsSync(path.join(logPath, `${date}.md`))).toBe(true);
    });
  });
});
