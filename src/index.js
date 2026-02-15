/**
 * captcha-relay — Human-in-the-loop CAPTCHA solving via Telegram
 *
 * Main entry point. Exports the CaptchaRelay class and convenience functions.
 */

export { CaptchaRelay } from './relay.js';
export { detect } from './detector.js';
export { annotate } from './annotator.js';
export { inject } from './injector.js';
