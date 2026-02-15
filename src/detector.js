/**
 * CAPTCHA Detector
 *
 * Identifies CAPTCHAs on a page by looking for known selectors,
 * iframes, and heuristic patterns.
 */

/** Known CAPTCHA iframe patterns */
const CAPTCHA_PATTERNS = [
  // reCAPTCHA v2
  { type: 'recaptcha-v2', selector: 'iframe[src*="recaptcha"]', challengeSelector: 'iframe[src*="recaptcha/api2/bframe"]' },
  // hCaptcha
  { type: 'hcaptcha', selector: 'iframe[src*="hcaptcha.com"]', challengeSelector: 'iframe[src*="hcaptcha.com/captcha"]' },
  // Cloudflare Turnstile
  { type: 'turnstile', selector: 'iframe[src*="challenges.cloudflare.com"]', challengeSelector: null },
  // Generic hidden captcha fields
  { type: 'hidden', selector: 'input[name*="captcha"][type="hidden"]', challengeSelector: null },
];

/**
 * Detect CAPTCHAs on the current page.
 *
 * @param {object} page - CDP page or Playwright page handle
 * @returns {Promise<Array<{type: string, element: object, hasChallenge: boolean}>>}
 */
export async function detect(page) {
  const results = [];

  for (const pattern of CAPTCHA_PATTERNS) {
    const found = await page.evaluate((sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const rect = el.getBoundingClientRect();
      return {
        found: true,
        visible: rect.width > 0 && rect.height > 0,
        rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        src: el.src || null,
      };
    }, pattern.selector);

    if (found) {
      let hasChallenge = false;
      if (pattern.challengeSelector) {
        hasChallenge = await page.evaluate((sel) => !!document.querySelector(sel), pattern.challengeSelector);
      }

      results.push({
        type: pattern.type,
        ...found,
        hasChallenge,
      });
    }
  }

  return results;
}

/**
 * Wait for a CAPTCHA to appear on the page.
 *
 * @param {object} page - CDP page or Playwright page handle
 * @param {object} options - { timeout: number, pollInterval: number }
 * @returns {Promise<object|null>} First detected CAPTCHA or null on timeout
 */
export async function waitForCaptcha(page, { timeout = 30000, pollInterval = 500 } = {}) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const detected = await detect(page);
    if (detected.length > 0) return detected[0];
    await new Promise((r) => setTimeout(r, pollInterval));
  }
  return null;
}
