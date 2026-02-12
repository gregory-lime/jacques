#!/usr/bin/env tsx
/**
 * Convert PNG pixel art mascots to SVG
 *
 * Reads pixel art images with Jimp and generates SVGs where each
 * non-transparent pixel becomes a <rect>. Uses row-level run-length encoding
 * to merge adjacent same-color pixels into wider rectangles.
 *
 * Usage: npx tsx scripts/convert-mascot-svg.ts
 */

import Jimp from 'jimp';
import { promises as fs } from 'fs';
import path from 'path';

const ASSETS_DIR = path.resolve(process.cwd(), '../assets');
const PUBLIC_DIR = path.resolve(process.cwd(), 'public');

const IMAGES = [
  { input: 'jacminihigh.png', output: 'jacminihigh.svg' },
  { input: 'jacsub.png', output: 'jacsub.svg' },
];

interface RGBA {
  r: number;
  g: number;
  b: number;
  a: number;
}

interface RectSpan {
  x: number;
  y: number;
  width: number;
  fill: string;
}

function getPixelRGBA(image: Jimp, x: number, y: number): RGBA {
  const color = image.getPixelColor(x, y);
  const rgba = Jimp.intToRGBA(color);
  return { r: rgba.r, g: rgba.g, b: rgba.b, a: rgba.a };
}

function isTransparent(pixel: RGBA): boolean {
  return pixel.a < 128;
}

function rgbaToHex(pixel: RGBA): string {
  const r = pixel.r.toString(16).padStart(2, '0');
  const g = pixel.g.toString(16).padStart(2, '0');
  const b = pixel.b.toString(16).padStart(2, '0');
  return `#${r}${g}${b}`;
}

/**
 * Build optimized rect list using row-level run-length encoding.
 * Consecutive same-color pixels in a row are merged into a single wider rect.
 */
function buildRects(image: Jimp): RectSpan[] {
  const width = image.getWidth();
  const height = image.getHeight();
  const rects: RectSpan[] = [];

  for (let y = 0; y < height; y++) {
    let runStart = -1;
    let runColor = '';
    let runLength = 0;

    for (let x = 0; x < width; x++) {
      const pixel = getPixelRGBA(image, x, y);

      if (isTransparent(pixel)) {
        if (runLength > 0) {
          rects.push({ x: runStart, y, width: runLength, fill: runColor });
          runLength = 0;
        }
        continue;
      }

      const hex = rgbaToHex(pixel);

      if (runLength > 0 && hex === runColor) {
        runLength++;
      } else {
        if (runLength > 0) {
          rects.push({ x: runStart, y, width: runLength, fill: runColor });
        }
        runStart = x;
        runColor = hex;
        runLength = 1;
      }
    }

    if (runLength > 0) {
      rects.push({ x: runStart, y, width: runLength, fill: runColor });
    }
  }

  return rects;
}

function generateSvg(width: number, height: number, rects: RectSpan[]): string {
  const rectElements = rects
    .map((r) => `  <rect x="${r.x}" y="${r.y}" width="${r.width}" height="1" fill="${r.fill}"/>`)
    .join('\n');

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" shape-rendering="crispEdges">
${rectElements}
</svg>
`;
}

async function convertImage(inputName: string, outputName: string) {
  const inputPath = path.join(ASSETS_DIR, inputName);
  const outputPath = path.join(PUBLIC_DIR, outputName);

  console.log(`\n  ${inputName} → ${outputName}`);
  const image = await Jimp.read(inputPath);

  const width = image.getWidth();
  const height = image.getHeight();

  const rects = buildRects(image);
  const svg = generateSvg(width, height, rects);

  await fs.writeFile(outputPath, svg, 'utf-8');
  console.log(`    ${width}x${height}px → ${rects.length} rects, ${Buffer.byteLength(svg)} bytes`);
}

async function main() {
  console.log('Converting pixel art PNGs to SVGs...');

  for (const { input, output } of IMAGES) {
    await convertImage(input, output);
  }

  console.log('\nDone.');
}

main().catch((err) => {
  console.error('Failed to convert mascot:', err);
  process.exit(1);
});
