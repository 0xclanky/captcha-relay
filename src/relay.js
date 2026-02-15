/**
 * CaptchaRelay — Main orchestrator
 *
 * Coordinates detection, annotation, Telegram relay, and injection.
 */

import { detect } from './detector.js';
import { annotate, annotateText } from './annotator.js';
import { inject } from './injector.js';

export class CaptchaRelay {
  /**
   * @param {object} config
   * @param {object} config.telegram - { sendPhoto, waitForReply } adapter functions
   * @param {string} config.chatId - Telegram chat ID to relay to
   * @param {number} config.timeout - Timeout in ms for human response (default: 120000)
   * @param {object} config.gridStyle - Annotation style overrides
   */
  constructor(config = {}) {
    this.telegram = config.telegram;
    this.chatId = config.chatId;
    this.timeout = config.timeout || 120000;
    this.gridStyle = config.gridStyle || {};
  }

  /**
   * Solve a CAPTCHA on the given page.
   *
   * Full pipeline: detect → screenshot → annotate → relay → inject
   *
   * @param {object} page - Browser page (Playwright or CDP)
   * @param {object} options
   * @param {string} options.type - Force CAPTCHA type ('grid' | 'text' | 'auto')
   * @param {number} options.cols - Grid columns (for grid type)
   * @param {number} options.rows - Grid rows (for grid type)
   * @returns {Promise<{success: boolean, answer: string, type: string}>}
   */
  async solve(page, options = {}) {
    const { type = 'auto', cols, rows } = options;

    // Step 1: Detect
    const captchas = await detect(page);
    if (captchas.length === 0) {
      return { success: false, answer: null, type: null, error: 'No CAPTCHA detected' };
    }

    const captcha = captchas[0];
    const captchaType = type === 'auto' ? this._inferType(captcha) : type;

    // Step 2: Screenshot the CAPTCHA area
    const screenshot = await this._screenshot(page, captcha);

    // Step 3: Annotate
    let annotated;
    let instructions;

    if (captchaType === 'grid') {
      const gridCols = cols || this._inferGridSize(captcha).cols;
      const gridRows = rows || this._inferGridSize(captcha).rows;
      annotated = await annotate(screenshot, { cols: gridCols, rows: gridRows, ...this.gridStyle });
      instructions = `🔓 CAPTCHA detected! Reply with the numbers of the correct cells (e.g. "1 3 5 8").\nGrid: ${gridRows}×${gridCols}. Timeout: ${this.timeout / 1000}s.`;
    } else {
      annotated = await annotateText(screenshot);
      instructions = `🔓 CAPTCHA detected! Reply with the text you see in the image.\nTimeout: ${this.timeout / 1000}s.`;
    }

    // Step 4: Relay to Telegram
    await this.telegram.sendPhoto(this.chatId, annotated, instructions);

    // Step 5: Wait for human reply
    const reply = await this.telegram.waitForReply(this.chatId, this.timeout);
    if (!reply) {
      return { success: false, answer: null, type: captchaType, error: 'Timeout waiting for human response' };
    }

    // Step 6: Parse and inject
    const answer = this._parseAnswer(reply, captchaType);
    const injected = await inject(page, captcha, answer, captchaType);

    return { success: injected, answer: reply, type: captchaType };
  }

  /**
   * Infer the CAPTCHA type from detection results.
   */
  _inferType(captcha) {
    if (captcha.type === 'recaptcha-v2' || captcha.type === 'hcaptcha') {
      return captcha.hasChallenge ? 'grid' : 'checkbox';
    }
    return 'text';
  }

  /**
   * Infer grid dimensions from CAPTCHA type.
   */
  _inferGridSize(captcha) {
    // reCAPTCHA typically uses 3x3 or 4x4
    if (captcha.type === 'recaptcha-v2') return { cols: 3, rows: 3 };
    if (captcha.type === 'hcaptcha') return { cols: 3, rows: 3 };
    return { cols: 3, rows: 3 };
  }

  /**
   * Screenshot the CAPTCHA element area.
   */
  async _screenshot(page, captcha) {
    if (captcha.rect) {
      return page.screenshot({
        clip: {
          x: Math.max(0, captcha.rect.x),
          y: Math.max(0, captcha.rect.y),
          width: captcha.rect.width,
          height: captcha.rect.height,
        },
      });
    }
    // Fallback: full page screenshot
    return page.screenshot();
  }

  /**
   * Parse the human's reply into an actionable answer.
   */
  _parseAnswer(reply, type) {
    const text = reply.trim();
    if (type === 'grid') {
      // Parse cell numbers: "1 3 5 8" or "1,3,5,8"
      return text
        .split(/[\s,]+/)
        .map(Number)
        .filter((n) => !isNaN(n) && n > 0);
    }
    // Text CAPTCHA: return as-is
    return text;
  }
}
