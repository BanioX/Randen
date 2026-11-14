/**
 * Renders the PNG app icons from public/icon.svg (home screen of iPhone, iPad and Android):
 *
 *   cd apps/web && node scripts/icons.ts [--background=#6d1f2f]
 *
 * - icon-192.png and icon-512.png: the drawing as it is (rounded, transparent corners).
 * - apple-touch-icon.png (180 px): full bleed on the brand colour. iOS rounds the corners
 *   itself; transparent corners would turn black.
 * - icon-maskable-512.png: full bleed on the brand colour, the drawing at 80 % in the middle,
 *   so it stays inside the safe zone whatever shape Android cuts out.
 *
 * The brand colour is read from the drawing: the fill of the shape that covers the whole view
 * box. A drawing without such a shape (or with a gradient there) needs `--background`.
 * The PNGs are committed; run this again whenever icon.svg changes. Locally set
 * PW_CHROMIUM_EXECUTABLE if the installed browser belongs to another Playwright version.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium, type Browser } from '@playwright/test';

/** Share of the icon the drawing may fill so that every mask keeps it whole. */
const SAFE_ZONE = 0.8;

const publicDir = resolve(import.meta.dirname, '..', 'public');
const svg = await readFile(resolve(publicDir, 'icon.svg'), 'utf8');
const source = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;

const unknown = process.argv.slice(2).filter((arg) => !/^--background=#[0-9a-f]{6}$/i.test(arg));
if (unknown.length > 0) {
  throw new Error(`Unknown option: ${unknown.join(' ')}. Known: --background=#rrggbb`);
}
const givenBackground = process.argv
  .slice(2)
  .find((arg) => arg.startsWith('--background='))
  ?.slice('--background='.length);

/** The fill of the first shape that covers the whole view box: the background of the icon. */
async function backgroundOf(browser: Browser): Promise<string> {
  const page = await browser.newPage({ viewport: { width: 512, height: 512 } });
  try {
    await page.setContent(`<body style="margin:0">${svg}</body>`);
    const fill = await page.evaluate(() => {
      const drawing = document.querySelector('svg');
      if (drawing === null) {
        return null;
      }
      const frame = drawing.viewBox.baseVal;
      const shapes = drawing.querySelectorAll<SVGGraphicsElement>(
        'rect, circle, ellipse, path, polygon',
      );
      for (const shape of shapes) {
        const box = shape.getBBox();
        const covers =
          box.x <= frame.x + 1 &&
          box.y <= frame.y + 1 &&
          box.width >= frame.width - 2 &&
          box.height >= frame.height - 2;
        if (covers) {
          return getComputedStyle(shape).fill;
        }
      }
      return null;
    });
    if (fill === null || !/^rgb\(\d+, \d+, \d+\)$/.test(fill)) {
      throw new Error(
        `icon.svg has no plain background shape over its whole view box (found: ${String(fill)}). ` +
          'Pass the brand colour: --background=#rrggbb',
      );
    }
    return fill;
  } finally {
    await page.close();
  }
}

interface Icon {
  file: string;
  size: number;
  /** Fill the square with the brand colour (no transparent corners). */
  fullBleed: boolean;
  /** Size of the drawing as a share of the icon. */
  scale: number;
}

const icons: Icon[] = [
  { file: 'icon-192.png', size: 192, fullBleed: false, scale: 1 },
  { file: 'icon-512.png', size: 512, fullBleed: false, scale: 1 },
  { file: 'apple-touch-icon.png', size: 180, fullBleed: true, scale: 1 },
  { file: 'icon-maskable-512.png', size: 512, fullBleed: true, scale: SAFE_ZONE },
];

const executablePath = process.env.PW_CHROMIUM_EXECUTABLE;
const browser = await chromium.launch(executablePath ? { executablePath } : {});
try {
  const background = givenBackground ?? (await backgroundOf(browser));
  process.stdout.write(`brand colour: ${background}\n`);

  for (const { file, size, fullBleed, scale } of icons) {
    const page = await browser.newPage({
      viewport: { width: size, height: size },
      deviceScaleFactor: 1,
    });
    const drawn = String(Math.round(size * scale));
    await page.setContent(
      `<body style="margin:0;width:${String(size)}px;height:${String(size)}px;display:grid;place-items:center;background:${fullBleed ? background : 'transparent'}">` +
        `<img src="${source}" width="${drawn}" height="${drawn}" style="display:block"></body>`,
    );
    await page.locator('img').evaluate((image: HTMLImageElement) => image.decode());
    await writeFile(
      resolve(publicDir, file),
      await page.screenshot({ type: 'png', omitBackground: true }),
    );
    await page.close();
    process.stdout.write(
      `${file} (${String(size)} px${fullBleed ? ', full bleed' : ''}${scale === 1 ? '' : `, drawing at ${String(scale * 100)} %`})\n`,
    );
  }
} finally {
  await browser.close();
}
