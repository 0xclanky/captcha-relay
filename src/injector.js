/**
 * CAPTCHA Injector
 *
 * Takes the human's parsed answer and interacts with the CAPTCHA
 * form to submit the solution.
 */

/**
 * Inject a CAPTCHA solution into the page.
 *
 * @param {object} page - Browser page
 * @param {object} captcha - Detection result with type and element info
 * @param {Array<number>|string} answer - Parsed answer (cell numbers or text)
 * @param {string} type - 'grid' or 'text'
 * @returns {Promise<boolean>} Whether injection appeared successful
 */
export async function inject(page, captcha, answer, type) {
  try {
    if (type === 'grid') {
      return await injectGrid(page, captcha, answer);
    } else if (type === 'text') {
      return await injectText(page, captcha, answer);
    } else if (type === 'checkbox') {
      return await injectCheckbox(page, captcha);
    }
    return false;
  } catch (err) {
    console.error('[captcha-relay] Injection error:', err.message);
    return false;
  }
}

/**
 * Click the specified grid cells in a reCAPTCHA/hCaptcha challenge.
 *
 * @param {object} page - Browser page
 * @param {object} captcha - Detection result
 * @param {Array<number>} cellNumbers - 1-indexed cell numbers to click
 */
async function injectGrid(page, captcha, cellNumbers) {
  // reCAPTCHA grid cells are typically in a table or div grid
  // We need to work within the challenge iframe
  const frameSelector = captcha.type === 'recaptcha-v2'
    ? 'iframe[src*="recaptcha/api2/bframe"]'
    : 'iframe[src*="hcaptcha.com/captcha"]';

  const frameHandle = await page.$(frameSelector);
  if (!frameHandle) {
    console.error('[captcha-relay] Challenge iframe not found');
    return false;
  }

  const frame = await frameHandle.contentFrame();
  if (!frame) {
    console.error('[captcha-relay] Could not access challenge iframe');
    return false;
  }

  // Get all clickable grid cells
  const cellSelector = captcha.type === 'recaptcha-v2'
    ? 'td.rc-imageselect-tile'      // reCAPTCHA grid cells
    : '.task-image .image-wrapper';   // hCaptcha grid cells

  const cells = await frame.$$(cellSelector);

  if (cells.length === 0) {
    console.error('[captcha-relay] No grid cells found');
    return false;
  }

  // Click each selected cell
  for (const num of cellNumbers) {
    const index = num - 1; // Convert 1-indexed to 0-indexed
    if (index >= 0 && index < cells.length) {
      await cells[index].click();
      // Small delay between clicks to appear human-like
      await new Promise((r) => setTimeout(r, 150 + Math.random() * 200));
    }
  }

  // Click the verify/submit button
  const verifySelector = captcha.type === 'recaptcha-v2'
    ? '#recaptcha-verify-button'
    : '.button-submit';

  const verifyButton = await frame.$(verifySelector);
  if (verifyButton) {
    await new Promise((r) => setTimeout(r, 300));
    await verifyButton.click();
  }

  return true;
}

/**
 * Type text into a text CAPTCHA input field.
 */
async function injectText(page, captcha, text) {
  // Look for common text CAPTCHA input patterns
  const inputSelectors = [
    'input[name*="captcha"]',
    'input[id*="captcha"]',
    'input[class*="captcha"]',
    'input[placeholder*="captcha" i]',
    'input[placeholder*="code" i]',
  ];

  for (const selector of inputSelectors) {
    const input = await page.$(selector);
    if (input) {
      await input.click();
      await input.fill(text);
      return true;
    }
  }

  console.error('[captcha-relay] No text CAPTCHA input found');
  return false;
}

/**
 * Click a CAPTCHA checkbox (reCAPTCHA "I'm not a robot").
 */
async function injectCheckbox(page, captcha) {
  const frameHandle = await page.$('iframe[src*="recaptcha/api2/anchor"]');
  if (!frameHandle) return false;

  const frame = await frameHandle.contentFrame();
  if (!frame) return false;

  const checkbox = await frame.$('#recaptcha-anchor');
  if (checkbox) {
    await checkbox.click();
    return true;
  }

  return false;
}
