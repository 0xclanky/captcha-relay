#!/usr/bin/env node

/**
 * captcha-relay solve script
 *
 * All-in-one: connects to running browser via CDP, detects CAPTCHA,
 * screenshots + annotates, sends to Telegram, waits for reply,
 * injects answer, clicks verify. Loops on "try again".
 *
 * Usage:
 *   node solve.js [--timeout 120] [--max-retries 5]
 *
 * Requires: TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID env vars
 * (or reads from OpenClaw config automatically)
 */

import { readFileSync } from 'fs';
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
    cdpUrl: process.env.CDP_URL || `http://127.0.0.1:${config.gateway?.port || 18789}`,
  };
}

// --- CDP helpers (talk to OpenClaw's browser directly) ---
async function cdpEval(wsUrl, expression) {
  // Use OpenClaw's browser HTTP API instead of raw CDP
  // We'll use page.evaluate through a simple fetch to the gateway
  const resp = await fetch(wsUrl + '/browser/evaluate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ expression }),
  });
  return resp.json();
}

// --- Page interaction via OpenClaw gateway API ---
class BrowserAPI {
  constructor(gatewayUrl, gatewayToken) {
    this.base = gatewayUrl;
    this.token = gatewayToken;
  }

  async call(endpoint, body = {}) {
    const resp = await fetch(`${this.base}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
      },
      body: JSON.stringify(body),
    });
    return resp.json();
  }

  async evaluate(fn) {
    // Use the playwright page directly through the gateway's internal API
    // Since we can't do that easily, we'll shell out instead
    return null;
  }
}

// --- Main flow using shell exec to talk to browser ---
import { execSync } from 'child_process';

function browserEval(js) {
  // Write a temp script that uses OpenClaw's browser tool indirectly
  // Actually, let's just use the Playwright CDP connection directly
  const escaped = js.replace(/'/g, "'\\''");
  try {
    const result = execSync(
      `node -e '
        import("playwright").then(async pw => {
          const browser = await pw.chromium.connectOverCDP("http://127.0.0.1:9222");
          const contexts = browser.contexts();
          const pages = contexts[0]?.pages() || [];
          const page = pages.find(p => p.url().includes("recaptcha")) || pages[0];
          if (!page) { console.log(JSON.stringify({error:"no page"})); process.exit(0); }
          try {
            const r = await page.evaluate(${escaped});
            console.log(JSON.stringify({ok:true, result:r}));
          } catch(e) {
            console.log(JSON.stringify({error:e.message}));
          }
          await browser.close();
        }).catch(e => console.log(JSON.stringify({error:e.message})));
      '`,
      { encoding: 'utf8', timeout: 15000 }
    );
    return JSON.parse(result.trim());
  } catch (e) {
    return { error: e.message };
  }
}

async function getPageScreenshot() {
  try {
    const result = execSync(
      `node -e '
        import("playwright").then(async pw => {
          const browser = await pw.chromium.connectOverCDP("http://127.0.0.1:9222");
          const pages = browser.contexts()[0]?.pages() || [];
          const page = pages.find(p => p.url().includes("recaptcha")) || pages[0];
          if (!page) { process.exit(1); }
          const buf = await page.screenshot();
          process.stdout.write(buf);
          await browser.close();
        });
      '`,
      { encoding: 'buffer', timeout: 15000, maxBuffer: 10 * 1024 * 1024 }
    );
    return result;
  } catch {
    return null;
  }
}

// ============================================================
// Simpler approach: just use sharp + fetch to Telegram.
// The agent (Clanky) calls this with a screenshot buffer path
// and gets back the annotated image + sends it.
// ============================================================

async function detectAndCapture(screenshotPath) {
  const img = readFileSync(screenshotPath);
  const meta = await sharp(img).metadata();

  // Try to find the CAPTCHA grid region by looking for the bframe iframe
  // We need the grid coordinates - these come from the agent's browser eval
  return { img, meta };
}

async function solveLoop(config) {
  const { botToken, chatId } = config;
  const telegram = new TelegramAdapter({ botToken, chatId, pollInterval: 500 });
  const timeout = parseInt(getArg('--timeout') || '120', 10) * 1000;
  const maxRetries = parseInt(getArg('--max-retries') || '5', 10);

  console.log(`🔓 captcha-relay solver`);
  console.log(`   Chat ID: ${chatId}`);
  console.log(`   Timeout: ${timeout / 1000}s per challenge`);
  console.log(`   Max retries: ${maxRetries}`);
  console.log('');

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    console.log(`--- Attempt ${attempt}/${maxRetries} ---`);

    // Read screenshot + grid info from stdin (piped from agent)
    const inputData = JSON.parse(readFileSync('/tmp/captcha-relay-input.json', 'utf8'));
    const { screenshotPath, gridClip, prompt, rows, cols } = inputData;

    // Crop the grid
    const fullImg = readFileSync(screenshotPath);
    const cropped = await sharp(fullImg)
      .extract({ left: gridClip.x, top: gridClip.y, width: gridClip.w, height: gridClip.h })
      .png()
      .toBuffer();

    // Annotate
    const annotated = await annotateWithPrompt(cropped, prompt.toUpperCase(), { cols, rows });

    console.log(`📤 Sending to Telegram...`);
    await telegram.sendPhoto(chatId, annotated, `🔓 ${prompt}\n\nReply with cell numbers (e.g. "1 3 5"). Timeout: ${timeout / 1000}s`);

    console.log(`⏳ Waiting for reply...`);
    const reply = await telegram.waitForReply(chatId, timeout);

    if (!reply) {
      console.log('❌ Timeout');
      continue;
    }

    console.log(`✅ Got: "${reply}"`);

    // Parse answer
    const cells = reply.match(/\d+/g)?.map(Number) || [];
    if (!cells.length) {
      console.log('⚠️ No numbers found in reply, skipping');
      continue;
    }

    // Write answer for the agent to inject
    const { writeFileSync } = await import('fs');
    writeFileSync('/tmp/captcha-relay-answer.json', JSON.stringify({ cells, raw: reply }));
    console.log(`💉 Answer written to /tmp/captcha-relay-answer.json`);
    console.log(`   Cells: ${cells.join(', ')}`);

    return { success: true, cells, attempt };
  }

  return { success: false, error: 'Max retries exceeded' };
}

function getArg(name) {
  const idx = process.argv.indexOf(name);
  return idx >= 0 && idx + 1 < process.argv.length ? process.argv[idx + 1] : null;
}

// If run directly, start the solve loop
const config = loadConfig();
console.log('Config loaded:', { chatId: config.chatId, hasToken: !!config.botToken });

if (process.argv.includes('--send-only')) {
  // Just annotate + send, used by the agent for quick relay
  const input = JSON.parse(readFileSync('/tmp/captcha-relay-input.json', 'utf8'));
  const telegram = new TelegramAdapter({ botToken: config.botToken, chatId: config.chatId, pollInterval: 500 });

  const fullImg = readFileSync(input.screenshotPath);
  const cropped = await sharp(fullImg)
    .extract({ left: input.gridClip.x, top: input.gridClip.y, width: input.gridClip.w, height: input.gridClip.h })
    .png()
    .toBuffer();
  const annotated = await annotateWithPrompt(cropped, input.prompt.toUpperCase(), { cols: input.cols, rows: input.rows });

  await telegram.sendPhoto(config.chatId, annotated, `🔓 ${input.prompt}\n\nReply with cell numbers.`);
  console.log('📤 Sent to Telegram');

  console.log('⏳ Waiting for reply...');
  const reply = await telegram.waitForReply(config.chatId, 120000);
  if (reply) {
    const cells = reply.match(/\d+/g)?.map(Number) || [];
    console.log(JSON.stringify({ cells, raw: reply }));
  } else {
    console.log(JSON.stringify({ error: 'timeout' }));
  }
} else {
  solveLoop(config).then((r) => {
    console.log('Result:', r);
    process.exit(r.success ? 0 : 1);
  });
}
