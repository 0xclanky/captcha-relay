/**
 * captcha-relay — Human-in-the-loop CAPTCHA solving via Telegram
 *
 * Main entry point. Exports all components.
 */

export { CaptchaRelay } from './relay.js';
export { detect, waitForCaptcha } from './detector.js';
export { annotate, annotateText } from './annotator.js';
export { inject } from './injector.js';
export { TelegramAdapter, OpenClawTelegramAdapter } from './telegram.js';
