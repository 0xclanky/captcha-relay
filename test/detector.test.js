import { describe, it } from 'node:test';
import assert from 'node:assert';
import { detect } from '../src/detector.js';

describe('detector', () => {
  it('should return empty array when no CAPTCHAs present', async () => {
    // Mock page with no CAPTCHA elements
    const mockPage = {
      evaluate: async (fn, selector) => null,
    };

    const results = await detect(mockPage);
    assert.ok(Array.isArray(results));
    assert.equal(results.length, 0);
  });

  it('should detect reCAPTCHA iframe', async () => {
    const mockPage = {
      evaluate: async (fn, selector) => {
        if (selector === 'iframe[src*="recaptcha"]') {
          return {
            found: true,
            visible: true,
            rect: { x: 10, y: 10, width: 300, height: 480 },
            src: 'https://www.google.com/recaptcha/api2/anchor',
          };
        }
        if (selector === 'iframe[src*="recaptcha/api2/bframe"]') {
          return true; // hasChallenge check
        }
        return null;
      },
    };

    const results = await detect(mockPage);
    assert.equal(results.length, 1);
    assert.equal(results[0].type, 'recaptcha-v2');
    assert.equal(results[0].visible, true);
  });

  it('should detect hidden captcha fields', async () => {
    const mockPage = {
      evaluate: async (fn, selector) => {
        if (selector === 'input[name*="captcha"][type="hidden"]') {
          return {
            found: true,
            visible: false,
            rect: { x: 0, y: 0, width: 0, height: 0 },
            src: null,
          };
        }
        return null;
      },
    };

    const results = await detect(mockPage);
    assert.equal(results.length, 1);
    assert.equal(results[0].type, 'hidden');
  });
});
