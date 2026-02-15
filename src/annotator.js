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
 * equal cells and overlay numbers on each.
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
    labelColor = '#FF0000',
    fontSize = 24,
    bgColor = 'rgba(0,0,0,0.7)',
  } = options;

  const metadata = await sharp(imageBuffer).metadata();
  const { width, height } = metadata;

  const cellWidth = Math.floor(width / cols);
  const cellHeight = Math.floor(height / rows);

  // Build SVG overlay with numbered labels
  const labels = [];
  let cellNum = 1;

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const x = col * cellWidth + 8;
      const y = row * cellHeight + fontSize + 4;

      // Background circle for readability
      labels.push(
        `<circle cx="${x + fontSize / 2}" cy="${y - fontSize / 3}" r="${fontSize * 0.7}" fill="${bgColor}"/>`
      );
      // Number label
      labels.push(
        `<text x="${x + fontSize / 2}" y="${y}" font-family="Arial,sans-serif" font-size="${fontSize}" font-weight="bold" fill="${labelColor}" text-anchor="middle">${cellNum}</text>`
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
 * Create a simple text annotation for non-grid CAPTCHAs.
 * Just adds a border and "Reply with the text you see" label.
 *
 * @param {Buffer} imageBuffer - PNG screenshot
 * @returns {Promise<Buffer>} Annotated PNG
 */
export async function annotateText(imageBuffer) {
  const metadata = await sharp(imageBuffer).metadata();
  const { width, height } = metadata;

  const bannerHeight = 30;
  const svgBanner = Buffer.from(
    `<svg width="${width}" height="${bannerHeight}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${width}" height="${bannerHeight}" fill="rgba(0,0,0,0.8)"/>
      <text x="${width / 2}" y="20" font-family="Arial,sans-serif" font-size="14" fill="#FFD700" text-anchor="middle">Reply with the text you see in the image</text>
    </svg>`
  );

  const annotated = await sharp(imageBuffer)
    .extend({ top: bannerHeight, background: { r: 0, g: 0, b: 0, alpha: 1 } })
    .composite([{ input: svgBanner, top: 0, left: 0 }])
    .png()
    .toBuffer();

  return annotated;
}
