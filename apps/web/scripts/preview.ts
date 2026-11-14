/**
 * Renders previews of app routes on the devices Randen is made for (ADR-0013), so every visible
 * change can be looked at before it ships.
 *
 * Usage:  pnpm preview:shots [route ...] [--dark] [--only=iphone,ipad,ipad-quer,web]
 *         Default routes: / and /styleguide. A route prefixed with `!` is visited but not
 *         captured, e.g. `!/more/demo?load=1` to prepare data first.
 * Output: apps/web/.previews/<timestamp>/sheet.png (routes as rows, devices side by side) plus
 *         one PNG per route and device.
 *
 * Runs the Vite dev server on a free port and Playwright. Set PW_CHROMIUM_EXECUTABLE if the
 * installed browser belongs to another Playwright version.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { chromium, type BrowserContext } from '@playwright/test';
import { createServer } from 'vite';

interface Device {
  id: string;
  label: string;
  width: number;
  height: number;
  touch: boolean;
}

const DEVICES: readonly Device[] = [
  { id: 'iphone', label: 'iPhone', width: 390, height: 844, touch: true },
  { id: 'ipad', label: 'iPad hochkant', width: 820, height: 1180, touch: true },
  { id: 'ipad-quer', label: 'iPad quer', width: 1180, height: 820, touch: true },
  { id: 'web', label: 'Web', width: 1440, height: 900, touch: false },
];

const args = process.argv.slice(2);
const dark = args.includes('--dark');
const only = args
  .find((arg) => arg.startsWith('--only='))
  ?.slice('--only='.length)
  .split(',');
const devices = only === undefined ? DEVICES : DEVICES.filter((device) => only.includes(device.id));
if (devices.length === 0) {
  throw new Error(`--only knows: ${DEVICES.map((device) => device.id).join(', ')}`);
}
const requested = args.filter((arg) => /^!?\//.test(arg));
const routes = requested.length > 0 ? requested : ['/', '/styleguide'];

const appRoot = resolve(import.meta.dirname, '..');
const outDir = join(appRoot, '.previews', new Date().toISOString().replace(/[:.]/g, '-'));
await mkdir(outDir, { recursive: true });

const server = await createServer({
  root: appRoot,
  logLevel: 'error',
  server: { host: '127.0.0.1', port: 5300, strictPort: false },
});
await server.listen();
const baseUrl = server.resolvedUrls?.local[0];
if (baseUrl === undefined) {
  throw new Error('Vite dev server did not report a local URL');
}

const executablePath = process.env.PW_CHROMIUM_EXECUTABLE;
const browser = await chromium.launch(executablePath ? { executablePath } : {});

const fileName = (route: string, device: Device) =>
  `${route === '/' ? 'cockpit' : route.replace(/^\/|\/$/g, '').replace(/[/?=&]/g, '-')}.${device.id}.png`;

/** A picture is taken only once the page is still: fonts loaded, no animation running (L-04). */
async function settle(context: BrowserContext, url: string) {
  const page = context.pages()[0] ?? (await context.newPage());
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.locator('h1').first().waitFor();
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(() =>
    document.getAnimations().every((animation) => animation.playState !== 'running'),
  );
  return page;
}

try {
  const rows: { route: string; shots: { device: Device; png: Buffer }[] }[] = [];
  // One context per device, kept for all routes: the data a `!` route prepares stays.
  const contexts = new Map<string, BrowserContext>();
  for (const device of devices) {
    contexts.set(
      device.id,
      await browser.newContext({
        viewport: { width: device.width, height: device.height },
        // Pictures a person looks at: twice the pixels.
        deviceScaleFactor: 2,
        hasTouch: device.touch,
        colorScheme: dark ? 'dark' : 'light',
        reducedMotion: 'reduce',
        locale: 'de-CH',
        timezoneId: 'Europe/Zurich',
      }),
    );
  }

  for (const entry of routes) {
    const visitOnly = entry.startsWith('!');
    const route = visitOnly ? entry.slice(1) : entry;
    const shots: { device: Device; png: Buffer }[] = [];
    for (const device of devices) {
      const context = contexts.get(device.id);
      if (context === undefined) {
        continue;
      }
      const page = await settle(context, new URL(route, baseUrl).href);
      if (visitOnly) {
        // Give a page that prepares data time to finish and to move on.
        await page.waitForTimeout(1500);
        continue;
      }
      const png = await page.screenshot();
      await writeFile(join(outDir, fileName(route, device)), png);
      shots.push({ device, png });
    }
    if (!visitOnly) {
      rows.push({ route, shots });
    }
  }

  // The contact sheet: routes as rows, the devices side by side at a compact size.
  const scale = 0.4;
  const html = `<!doctype html><html lang="de-CH"><body style="margin:0;padding:28px;background:${dark ? '#1a1012' : '#ece5da'};font-family:system-ui,sans-serif">${rows
    .map(
      (row) =>
        `<div style="font:600 15px system-ui;color:${dark ? '#e8d9c0' : '#3f0f1c'};margin:6px 0 10px 2px">${row.route}</div><div style="display:flex;gap:24px;align-items:flex-start;margin-bottom:30px">${row.shots
          .map(
            ({ device, png }) =>
              `<div><div style="font:500 12px system-ui;color:${dark ? '#c1b6a2' : '#605a50'};margin:0 0 6px 2px">${device.label} · ${String(device.width)} × ${String(device.height)}</div><img src="data:image/png;base64,${png.toString('base64')}" style="display:block;width:${String(device.width * scale)}px;height:${String(device.height * scale)}px;border-radius:12px;box-shadow:0 10px 26px rgb(63 15 28 / .2)"></div>`,
          )
          .join('')}</div>`,
    )
    .join('')}</body></html>`;
  const sheetWidth = 56 + devices.reduce((sum, device) => sum + device.width * scale + 24, 0);
  const sheet = await browser.newPage({
    viewport: { width: Math.ceil(sheetWidth), height: 600 },
    deviceScaleFactor: 2,
  });
  await sheet.setContent(html);
  await sheet.screenshot({ path: join(outDir, 'sheet.png'), fullPage: true });

  process.stdout.write(`Previews: ${outDir}\n  sheet.png\n`);
  for (const row of rows) {
    for (const { device } of row.shots) {
      process.stdout.write(`  ${fileName(row.route, device)}\n`);
    }
  }
} finally {
  await browser.close();
  await server.close();
}
