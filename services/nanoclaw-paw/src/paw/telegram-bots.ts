/**
 * Telegram Bot Manager for NanoClaw-PAW.
 *
 * Manages 6 grammY bot instances (3 Clark DMs, 2 AIOO groups, 1 Unares DM).
 * Each bot has independent user allowlisting and handler routing.
 * Bot tokens read from env vars referenced in routing.json.
 */
import { Bot } from 'grammy';
import { autoRetry } from '@grammyjs/auto-retry';
import fs from 'fs';
import path from 'path';

import { logger } from '../logger.js';
import type { PawRoutingConfig, PawRoutingEntry } from './config.js';
import { normalizeEntities } from './config.js';
import { sendToClark } from './clark-handler.js';
import { sendToUnares } from './unares-handler.js';
import { writeToAioo } from './ipc-poller.js';

interface ActiveBot {
  bot: Bot;
  routeName: string;
  route: PawRoutingEntry;
}

const activeBots = new Map<string, ActiveBot>();

// ── Bot Factory ─────────────────────────────────────────────────────

function createBot(routeName: string, route: PawRoutingEntry): Bot | null {
  const tokenEnv = route.telegram?.botTokenEnv;
  if (!tokenEnv) return null;

  const token = process.env[tokenEnv];
  if (!token) {
    logger.warn({ routeName, tokenEnv }, 'Bot token env var missing — skipping');
    return null;
  }

  const bot = new Bot(token);
  bot.api.config.use(autoRetry());
  bot.catch((err) => {
    logger.error({ routeName, err: err.message }, 'Bot error');
  });
  return bot;
}

function isUserAllowed(userId: number, route: PawRoutingEntry): boolean {
  const allowed = route.telegram?.allowedUsers || [];
  return allowed.includes(String(userId));
}

// ── Conversation Logging ────────────────────────────────────────────

function logDir(workspaceRoot: string, route: PawRoutingEntry, routeName: string): string {
  const entity = normalizeEntities(route)[0];
  return path.join(workspaceRoot, 'memory-vault', entity, 'Logs', 'telegram', routeName);
}

function logMessage(
  workspaceRoot: string, route: PawRoutingEntry, routeName: string,
  sender: string, text: string,
): void {
  const dir = logDir(workspaceRoot, route, routeName);
  fs.mkdirSync(dir, { recursive: true });
  const date = new Date().toISOString().slice(0, 10);
  const ts = new Date().toISOString();
  const file = path.join(dir, `${date}.md`);
  const entry = `\n## ${ts} — ${sender}\n\n${text}\n`;
  fs.appendFileSync(file, entry);
}

// ── Message Splitting ───────────────────────────────────────────────

const TELEGRAM_MAX_LENGTH = 4096;

function splitMessage(text: string): string[] {
  if (text.length <= TELEGRAM_MAX_LENGTH) return [text];
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += TELEGRAM_MAX_LENGTH) {
    chunks.push(text.slice(i, i + TELEGRAM_MAX_LENGTH));
  }
  return chunks;
}

// ── DM Handler (Clark + Unares) ─────────────────────────────────────

function setupDmHandler(
  bot: Bot, routeName: string, route: PawRoutingEntry, workspaceRoot: string,
): void {
  // /start must be registered before message:text (Grammy processes in order)
  bot.command('start', async (ctx) => {
    const label = route.target === 'clark' ? 'Clark (Clarity Architect)' : 'Unares (Workspace Observer)';
    await ctx.reply(`${label} ready. Send a message to begin.`);
  });

  bot.on('message:text', async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId || !isUserAllowed(userId, route)) {
      logger.warn({ routeName, userId, username: ctx.from?.username }, 'Unauthorized DM');
      return;
    }

    const text = ctx.message.text;
    logMessage(workspaceRoot, route, routeName, route.human, text);

    let response: string;
    if (route.target === 'clark') {
      response = await sendToClark(text, route.human, route, workspaceRoot);
    } else {
      response = await sendToUnares(text, workspaceRoot);
    }

    logMessage(workspaceRoot, route, routeName, route.target, response);

    for (const chunk of splitMessage(response)) {
      await ctx.reply(chunk);
    }
  });
}

// ── Group Handler (AIOO) ────────────────────────────────────────────

function setupGroupHandler(
  bot: Bot, routeName: string, route: PawRoutingEntry, workspaceRoot: string,
): void {
  const trigger = route.telegram?.trigger || '@aioo';
  const entity = normalizeEntities(route)[0];

  bot.on('message:text', async (ctx) => {
    const text = ctx.message.text;
    if (!text.includes(trigger)) return;

    const userId = ctx.from?.id;
    if (!userId || !isUserAllowed(userId, route)) {
      logger.warn({ routeName, userId, username: ctx.from?.username }, 'Unauthorized group message');
      return;
    }

    const cleanText = text.replace(trigger, '').trim();
    logMessage(workspaceRoot, route, routeName, route.human, text);

    await writeToAioo(workspaceRoot, entity, 'human-message', {
      channel: `telegram-${routeName}`,
      human: route.human,
      text: cleanText,
      chatId: String(ctx.chat.id),
      messageId: String(ctx.message.message_id),
    });
  });

  // Inline keyboard callback handler
  bot.on('callback_query:data', async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId || !isUserAllowed(userId, route)) return;

    const data = ctx.callbackQuery.data;
    logMessage(workspaceRoot, route, routeName, route.human, `[callback] ${data}`);

    await writeToAioo(workspaceRoot, entity, 'human-message', {
      channel: `telegram-${routeName}`,
      human: route.human,
      text: data.split(':').pop() || data,
      callbackData: data,
      chatId: String(ctx.chat?.id),
      replyTo: String(ctx.callbackQuery.message?.message_id),
    });

    await ctx.answerCallbackQuery();
    try {
      await ctx.editMessageReplyMarkup({ reply_markup: { inline_keyboard: [] } });
    } catch { /* message may already be edited */ }
  });
}

// ── Human-Reply Handler ─────────────────────────────────────────────

export async function handleHumanReply(
  envelope: { payload: Record<string, unknown> },
): Promise<void> {
  const { channel, text, chatId, inlineKeyboard } = envelope.payload as {
    channel?: string; text?: string; chatId?: string;
    inlineKeyboard?: Array<Array<{ text: string; callback_data: string }>>;
  };

  if (!channel || !text || !chatId) {
    logger.error({ payload: envelope.payload }, 'human-reply missing required fields');
    return;
  }

  const routeName = channel.replace('telegram-', '');
  const active = activeBots.get(routeName);
  if (!active) {
    logger.error({ routeName, channel }, 'No bot found for human-reply route');
    return;
  }

  const replyMarkup = inlineKeyboard
    ? { inline_keyboard: inlineKeyboard }
    : undefined;

  for (const chunk of splitMessage(String(text))) {
    await active.bot.api.sendMessage(chatId, chunk, {
      reply_markup: replyMarkup,
    });
  }
}

// ── Lifecycle ───────────────────────────────────────────────────────

export function getBotForRoute(routeName: string): Bot | null {
  return activeBots.get(routeName)?.bot ?? null;
}

export async function startTelegramBots(
  config: PawRoutingConfig,
  workspaceRoot: string,
): Promise<number> {
  let started = 0;

  for (const [routeName, route] of Object.entries(config.routes)) {
    if (!route.telegram) continue;

    const bot = createBot(routeName, route);
    if (!bot) continue;

    if (route.telegram.mode === 'dm') {
      setupDmHandler(bot, routeName, route, workspaceRoot);
    } else {
      setupGroupHandler(bot, routeName, route, workspaceRoot);
    }

    bot.start({ drop_pending_updates: true });
    activeBots.set(routeName, { bot, routeName, route });
    logger.info({ routeName, target: route.target, mode: route.telegram.mode }, 'Telegram bot started');
    started++;
  }

  if (started === 0) {
    logger.warn('No Telegram bots started — check bot token env vars');
  } else {
    logger.info({ count: started }, 'Telegram bots running');
  }

  return started;
}

export async function stopTelegramBots(): Promise<void> {
  for (const [routeName, { bot }] of activeBots) {
    try {
      await bot.stop();
      logger.info({ routeName }, 'Telegram bot stopped');
    } catch { /* ok */ }
  }
  activeBots.clear();
}

/** Test helper */
export function _clearBots(): void {
  activeBots.clear();
}
