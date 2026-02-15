import { describe, it } from 'node:test';
import assert from 'node:assert';
import { CaptchaRelay } from '../src/relay.js';

describe('CaptchaRelay', () => {
  it('should return error when no CAPTCHA detected', async () => {
    const mockTelegram = {
      sendPhoto: async () => {},
      waitForReply: async () => null,
    };

    const relay = new CaptchaRelay({
      telegram: mockTelegram,
      chatId: '12345',
    });

    // Mock page with no CAPTCHAs
    const mockPage = {
      evaluate: async () => null,
    };

    const result = await relay.solve(mockPage);
    assert.equal(result.success, false);
    assert.equal(result.error, 'No CAPTCHA detected');
  });

  it('should parse grid answers correctly', () => {
    const relay = new CaptchaRelay({ telegram: {}, chatId: '123' });

    // Space-separated
    assert.deepEqual(relay._parseAnswer('1 3 5 8', 'grid'), [1, 3, 5, 8]);

    // Comma-separated
    assert.deepEqual(relay._parseAnswer('2,4,6', 'grid'), [2, 4, 6]);

    // Mixed
    assert.deepEqual(relay._parseAnswer('1, 3, 7', 'grid'), [1, 3, 7]);

    // Text type returns as-is
    assert.equal(relay._parseAnswer('xK9mP2', 'text'), 'xK9mP2');
  });

  it('should handle timeout gracefully', async () => {
    let photoCaptured = null;
    const mockTelegram = {
      sendPhoto: async (chatId, image, caption) => {
        photoCaptured = { chatId, caption };
      },
      waitForReply: async () => null, // Simulates timeout
    };

    const relay = new CaptchaRelay({
      telegram: mockTelegram,
      chatId: '12345',
      timeout: 100,
    });

    // Mock page with a CAPTCHA
    const mockPage = {
      evaluate: async (fn, selector) => {
        if (selector === 'iframe[src*="recaptcha"]') {
          return {
            found: true,
            visible: true,
            rect: { x: 0, y: 0, width: 300, height: 300 },
            src: 'https://google.com/recaptcha/api2/anchor',
          };
        }
        if (selector === 'iframe[src*="recaptcha/api2/bframe"]') {
          return true;
        }
        return null;
      },
      screenshot: async () => {
        // Return a minimal valid PNG
        const sharp = (await import('sharp')).default;
        return sharp({
          create: { width: 300, height: 300, channels: 3, background: { r: 100, g: 100, b: 100 } },
        }).png().toBuffer();
      },
    };

    const result = await relay.solve(mockPage);
    assert.equal(result.success, false);
    assert.equal(result.error, 'Timeout waiting for human response');
    assert.ok(photoCaptured, 'Should have sent the CAPTCHA to Telegram');
    assert.equal(photoCaptured.chatId, '12345');
  });
});
