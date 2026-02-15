/**
 * CAPTCHA Annotator
 *
 * Takes a screenshot of a CAPTCHA and overlays numbered labels
 * on grid cells for easy identification by the human solver.
 */

import sharp from 'sharp';

/**
 * Detect grid cells in a CAPTCHA image and overlay numbered labels.
 *
 * For reCAPTCHA-style 3x3 or 4x4 grids, we divide the image into
 * equal cells and overlay numbers centered in each cell.
 *
 * @param {Buffer} imageBuffer - PNG screenshot of the CAPTCHA area
 * @param {object} options
 * @param {number} options.cols - Number of grid columns (default: 3)
 * @param {number} options.rows - Number of grid rows (default: 3)
 * @param {string} options.labelColor - Label text color (default: '#FF0000')
 * @param {number} options.fontSize - Font size for labels (default: 24)
 * @returns {Promise<Buffer>} Annotated PNG image
 */
export async function annotate(imageBuffer, options = {}) {
  const {
    cols = 3,
    rows = 3,
    labelColor = '#FFFFFF',
    fontSize = 22,
    bgColor = 'rgba(0,0,0,0.65)',
    strokeColor = '#000000',
  } = options;

  const metadata = await sharp(imageBuffer).metadata();
  const { width, height } = metadata;

  const cellWidth = width / cols;
  const cellHeight = height / rows;
  const badgeSize = Math.max(fontSize + 8, 28);

  // Build SVG overlay with numbered labels centered in each cell
  const labels = [];
  let cellNum = 1;

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      // Center of each cell
      const cx = col * cellWidth + cellWidth / 2;
      const cy = row * cellHeight + cellHeight / 2;

      // Background circle for readability
      labels.push(
        `<circle cx="${cx}" cy="${cy}" r="${badgeSize / 2}" fill="${bgColor}" stroke="${strokeColor}" stroke-width="1.5"/>`
      );
      // Number label (centered)
      labels.push(
        `<text x="${cx}" y="${cy}" dy="0.35em" font-family="Arial,Helvetica,sans-serif" font-size="${fontSize}" font-weight="bold" fill="${labelColor}" text-anchor="middle">${cellNum}</text>`
      );
      cellNum++;
    }
  }

  const svgOverlay = Buffer.from(
    `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      ${labels.join('\n      ')}
    </svg>`
  );

  // Composite the overlay onto the original image
  const annotated = await sharp(imageBuffer)
    .composite([{ input: svgOverlay, top: 0, left: 0 }])
    .png()
    .toBuffer();

  return annotated;
}

/**
 * Annotate with a header banner showing the CAPTCHA prompt.
 *
 * @param {Buffer} imageBuffer - PNG screenshot of the grid
 * @param {object} options - Grid options + prompt text
 * @returns {Promise<Buffer>} Annotated PNG with header
 */
export async function annotateWithPrompt(imageBuffer, prompt, options = {}) {
  const metadata = await sharp(imageBuffer).metadata();
  const { width } = metadata;

  const bannerHeight = 44;
  const svgBanner = Buffer.from(
    `<svg width="${width}" height="${bannerHeight}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${width}" height="${bannerHeight}" fill="#4285F4"/>
      <text x="${width / 2}" y="28" font-family="Arial,Helvetica,sans-serif" font-size="16" font-weight="bold" fill="#FFFFFF" text-anchor="middle">${escapeXml(prompt)}</text>
    </svg>`
  );

  // Add banner on top, then annotate the grid
  const withBanner = await sharp(imageBuffer)
    .extend({ top: bannerHeight, bottom: 0, left: 0, right: 0, background: { r: 66, g: 133, b: 244, alpha: 1 } })
    .composite([{ input: svgBanner, top: 0, left: 0 }])
    .png()
    .toBuffer();

  // Now annotate the grid portion (offset by banner height)
  const gridAnnotated = await annotate(imageBuffer, options);

  // Combine: banner + annotated grid
  const final = await sharp(gridAnnotated)
    .extend({ top: bannerHeight, bottom: 0, left: 0, right: 0, background: { r: 66, g: 133, b: 244, alpha: 1 } })
    .composite([{ input: svgBanner, top: 0, left: 0 }])
    .png()
    .toBuffer();

  return final;
}

/**
 * Create a simple text annotation for non-grid CAPTCHAs.
 *
 * @param {Buffer} imageBuffer - PNG screenshot
 * @returns {Promise<Buffer>} Annotated PNG
 */
export async function annotateText(imageBuffer) {
  const metadata = await sharp(imageBuffer).metadata();
  const { width } = metadata;

  const bannerHeight = 30;
  const svgBanner = Buffer.from(
    `<svg width="${width}" height="${bannerHeight}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${width}" height="${bannerHeight}" fill="rgba(0,0,0,0.8)"/>
      <text x="${width / 2}" y="20" font-family="Arial,Helvetica,sans-serif" font-size="14" fill="#FFD700" text-anchor="middle">Reply with the text you see in the image</text>
    </svg>`
  );

  const annotated = await sharp(imageBuffer)
    .extend({ top: bannerHeight, bottom: 0, left: 0, right: 0, background: { r: 0, g: 0, b: 0, alpha: 1 } })
    .composite([{ input: svgBanner, top: 0, left: 0 }])
    .png()
    .toBuffer();

  return annotated;
}

function escapeXml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
