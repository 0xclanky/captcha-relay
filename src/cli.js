#!/usr/bin/env node

/**
 * captcha-relay CLI
 *
 * Standalone tool to test CAPTCHA relay manually.
 *
 * Usage:
 *   captcha-relay solve --url <page-url> --bot-token <token> --chat-id <id>
 *   captcha-relay test --bot-token <token> --chat-id <id>
 */

import { CaptchaRelay } from './relay.js';
import { TelegramAdapter } from './telegram.js';
import { annotate } from './annotator.js';
import { readFileSync } from 'fs';

const args = process.argv.slice(2);
const command = args[0];

function getArg(name) {
  const idx = args.indexOf(`--${name}`);
  return idx >= 0 && idx + 1 < args.length ? args[idx + 1] : null;
}

function usage() {
  console.log(`
captcha-relay — Human-in-the-loop CAPTCHA solving

Commands:
  test      Send a test image to Telegram and wait for a reply
  annotate  Annotate a local image with grid overlay

Options:
  --bot-token <token>   Telegram bot token (or TELEGRAM_BOT_TOKEN env)
  --chat-id <id>        Telegram chat ID (or TELEGRAM_CHAT_ID env)
  --image <path>        Path to image file (for annotate command)
  --cols <n>            Grid columns (default: 3)
  --rows <n>            Grid rows (default: 3)
  --timeout <ms>        Reply timeout in ms (default: 120000)
`);
}

async function testRelay() {
  const botToken = getArg('bot-token') || process.env.TELEGRAM_BOT_TOKEN;
  const chatId = getArg('chat-id') || process.env.TELEGRAM_CHAT_ID;
  const timeout = parseInt(getArg('timeout') || '120000', 10);

  if (!botToken || !chatId) {
    console.error('Error: --bot-token and --chat-id are required (or set env vars)');
    process.exit(1);
  }

  const telegram = new TelegramAdapter({ botToken, chatId });

  console.log('📤 Sending test message to Telegram...');
  await telegram.sendMessage(chatId, '🔓 captcha-relay test! Reply with any message to confirm the relay is working.');

  console.log(`⏳ Waiting for reply (timeout: ${timeout / 1000}s)...`);
  const reply = await telegram.waitForReply(chatId, timeout);

  if (reply) {
    console.log(`✅ Got reply: "${reply}"`);
  } else {
    console.log('❌ Timeout — no reply received');
    process.exit(1);
  }
}

async function annotateImage() {
  const imagePath = getArg('image');
  const cols = parseInt(getArg('cols') || '3', 10);
  const rows = parseInt(getArg('rows') || '3', 10);

  if (!imagePath) {
    console.error('Error: --image <path> is required');
    process.exit(1);
  }

  const imageBuffer = readFileSync(imagePath);
  const annotated = await annotate(imageBuffer, { cols, rows });

  const outPath = imagePath.replace(/(\.\w+)$/, '.annotated$1');
  const { writeFileSync } = await import('fs');
  writeFileSync(outPath, annotated);
  console.log(`✅ Annotated image saved to: ${outPath}`);
}

// Main
switch (command) {
  case 'test':
    testRelay().catch((err) => {
      console.error('Error:', err.message);
      process.exit(1);
    });
    break;
  case 'annotate':
    annotateImage().catch((err) => {
      console.error('Error:', err.message);
      process.exit(1);
    });
    break;
  default:
    usage();
    break;
}
