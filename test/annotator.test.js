import { describe, it } from 'node:test';
import assert from 'node:assert';
import { annotate, annotateText } from '../src/annotator.js';
import sharp from 'sharp';

describe('annotator', () => {
  it('should annotate a blank image with 3x3 grid numbers', async () => {
    // Create a simple 300x300 red test image
    const testImage = await sharp({
      create: { width: 300, height: 300, channels: 3, background: { r: 200, g: 50, b: 50 } },
    })
      .png()
      .toBuffer();

    const annotated = await annotate(testImage, { cols: 3, rows: 3 });

    assert.ok(annotated instanceof Buffer, 'Should return a Buffer');
    assert.ok(annotated.length > testImage.length, 'Annotated image should be larger (has overlay)');

    // Verify it's valid PNG
    const meta = await sharp(annotated).metadata();
    assert.equal(meta.format, 'png');
    assert.equal(meta.width, 300);
    assert.equal(meta.height, 300);
  });

  it('should annotate with 4x4 grid', async () => {
    const testImage = await sharp({
      create: { width: 400, height: 400, channels: 3, background: { r: 50, g: 100, b: 200 } },
    })
      .png()
      .toBuffer();

    const annotated = await annotate(testImage, { cols: 4, rows: 4 });
    const meta = await sharp(annotated).metadata();
    assert.equal(meta.width, 400);
    assert.equal(meta.height, 400);
  });

  it('should annotate text CAPTCHA with banner', async () => {
    const testImage = await sharp({
      create: { width: 200, height: 60, channels: 3, background: { r: 240, g: 240, b: 240 } },
    })
      .png()
      .toBuffer();

    const annotated = await annotateText(testImage);
    const meta = await sharp(annotated).metadata();

    assert.ok(meta.height > 60, 'Should be taller due to banner');
    assert.equal(meta.width, 200);
  });
});
