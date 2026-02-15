/**
 * CAPTCHA Capture
 *
 * Utilities to screenshot just the CAPTCHA challenge from reCAPTCHA/hCaptcha iframes.
 * Works with Playwright-style page objects (OpenClaw browser, Puppeteer, Playwright).
 */

/**
 * Capture the reCAPTCHA challenge grid and metadata by screenshotting
 * the bframe iframe element directly.
 *
 * @param {object} page - Playwright/Puppeteer page object or OpenClaw browser evaluator
 * @param {object} options
 * @param {function} options.screenshot - async (clip) => Buffer. Takes a clip region, returns PNG.
 * @returns {Promise<{grid: Buffer, prompt: string, rows: number, cols: number} | null>}
 */
export async function captureRecaptcha(page, options = {}) {
  // Get iframe position and internal element positions
  const info = await page.evaluate(() => {
    const bf = document.querySelector('iframe[src*="recaptcha/api2/bframe"]');
    if (!bf) return null;

    const iRect = bf.getBoundingClientRect();
    const doc = bf.contentDocument;
    if (!doc) return null;

    const table = doc.querySelector('.rc-imageselect-target table');
    const header = doc.querySelector('.rc-imageselect-desc-wrapper');
    if (!table) return null;

    const tRect = table.getBoundingClientRect();
    const rows = doc.querySelectorAll('tr').length;
    const cols = doc.querySelector('tr')?.querySelectorAll('td').length || 3;
    const prompt = header?.innerText?.replace(/\n/g, ' ') || '';

    return {
      iframe: { x: iRect.x, y: iRect.y },
      table: { x: tRect.x, y: tRect.y, w: tRect.width, h: tRect.height },
      rows,
      cols,
      prompt,
    };
  });

  if (!info) return null;

  // The table coordinates are relative to the iframe viewport.
  // For a page-level screenshot, we need to add the iframe's page position.
  const clip = {
    x: Math.round(info.iframe.x + info.table.x),
    y: Math.round(info.iframe.y + info.table.y),
    width: Math.round(info.table.w),
    height: Math.round(info.table.h),
  };

  const grid = await options.screenshot(clip);

  return {
    grid,
    prompt: info.prompt,
    rows: info.rows,
    cols: info.cols,
  };
}
