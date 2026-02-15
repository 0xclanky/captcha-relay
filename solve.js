#!/usr/bin/env node

/**
 * captcha-relay solve script
 *
 * All-in-one: crops + annotates CAPTCHA, sends to Telegram with inline
 * buttons, waits for human selection, returns answer as JSON.
 *
 * Usage:
 *   node solve.js [--send-only] [--no-buttons] [--timeout 120]
 *
 * Input: reads /tmp/captcha-relay-input.json
 *   { screenshotPath, gridClip: {x,y,w,h}, prompt, rows, cols }
 *
 * Output (stdout): JSON { cells: [1,3,5], raw: "..." }
 *
 * Reads bot token + chat ID from OpenClaw config automatically.
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import sharp from 'sharp';
import { annotateWithPrompt } from './src/annotator.js';
import { TelegramAdapter } from './src/telegram.js';

// --- Config ---
const OPENCLAW_CONFIG = resolve(process.env.HOME, '.openclaw/openclaw.json');
const OPENCLAW_ALLOW = resolve(process.env.HOME, '.openclaw/credentials/telegram-allowFrom.json');

function loadConfig() {
  const config = JSON.parse(readFileSync(OPENCLAW_CONFIG, 'utf8'));
  const allow = JSON.parse(readFileSync(OPENCLAW_ALLOW, 'utf8'));
  return {
    botToken: process.env.TELEGRAM_BOT_TOKEN || config.channels?.telegram?.botToken,
    chatId: process.env.TELEGRAM_CHAT_ID || allow.allowFrom?.[0],
  };
}

function getArg(name) {
  const idx = process.argv.indexOf(name);
  return idx >= 0 && idx + 1 < process.argv.length ? process.argv[idx + 1] : null;
}

const hasFlag = (name) => process.argv.includes(name);

// --- Main ---
const config = loadConfig();
const timeout = parseInt(getArg('--timeout') || '120', 10) * 1000;
const useButtons = !hasFlag('--no-buttons');

console.error(`Config: chatId=${config.chatId} buttons=${useButtons} timeout=${timeout / 1000}s`);

const telegram = new TelegramAdapter({
  botToken: config.botToken,
  chatId: config.chatId,
  pollInterval: 500,
});

const input = JSON.parse(readFileSync('/tmp/captcha-relay-input.json', 'utf8'));
const { screenshotPath, gridClip, prompt, rows, cols } = input;

// Crop + annotate
const fullImg = readFileSync(screenshotPath);
const cropped = await sharp(fullImg)
  .extract({ left: gridClip.x, top: gridClip.y, width: gridClip.w, height: gridClip.h })
  .png()
  .toBuffer();
const annotated = await annotateWithPrompt(cropped, prompt.toUpperCase(), { cols, rows });

const caption = `🔓 ${prompt}\n\n${useButtons ? 'Tap cells, then hit Submit.' : 'Reply with cell numbers (e.g. "1 3 5").'}`;

if (useButtons) {
  // Send with inline keyboard
  const msg = await telegram.sendCaptchaWithButtons(config.chatId, annotated, caption, cols, rows);
  console.error(`📤 Sent with buttons (msg ${msg.message_id})`);
  console.error('⏳ Waiting for button response...');

  const result = await telegram.waitForButtonResponse(config.chatId, msg.message_id, cols, rows, timeout);

  if (result) {
    console.log(JSON.stringify({ cells: result.cells, skipped: result.skipped }));
  } else {
    console.log(JSON.stringify({ error: 'timeout' }));
  }
} else {
  // Fallback: text reply mode
  await telegram.sendPhoto(config.chatId, annotated, caption);
  console.error('📤 Sent (text mode)');
  console.error('⏳ Waiting for reply...');

  const reply = await telegram.waitForReply(config.chatId, timeout);

  if (reply) {
    const cells = reply.match(/\d+/g)?.map(Number) || [];
    console.log(JSON.stringify({ cells, raw: reply }));
  } else {
    console.log(JSON.stringify({ error: 'timeout' }));
  }
}
