import { expect, NAV_LABEL, test, VIEWPORTS, visit } from './test';

const title = { level: 1 } as const;

test.describe('in the browser on a desk (1280 px)', () => {
  test.use({ viewport: VIEWPORTS.desktop });

  test('opens on an empty device and shows the cockpit', async ({ page, errors }) => {
    const response = await page.goto('/');
    expect(response?.status()).toBe(200);
    await expect(page).toHaveTitle('Randen');
    await expect(page.getByRole('heading', title)).toBeVisible();

    // An empty device gets a business of its own, without an account or a server.
    const sidebar = page.getByRole('navigation', { name: NAV_LABEL });
    await expect(sidebar.getByText('Mein Betrieb')).toBeVisible();
    const here = sidebar.locator('a[aria-current="page"]');
    await expect(here).toHaveAttribute('href', '/');
    await expect(here).toHaveText('Cockpit');

    await expect(page.locator('html')).toHaveAttribute('lang', 'de-CH');
    await expect(page.locator('head link[rel="manifest"]')).toHaveCount(1);
    errors.expectNone();
  });

  test('every entry of the sidebar leads to a page with a title', async ({ page, errors }) => {
    await visit(page, '/');
    const sidebar = page.getByRole('navigation', { name: NAV_LABEL });
    const links = sidebar.getByRole('link');
    const count = await links.count();
    expect(count).toBeGreaterThanOrEqual(10);

    for (let index = 0; index < count; index += 1) {
      const link = links.nth(index);
      const href = (await link.getAttribute('href')) ?? '';
      const name = (await link.innerText()).trim() || href;
      await link.click();
      await expect(page, name).toHaveURL(href);
      const heading = page.getByRole('heading', title);
      await expect(heading, name).toBeVisible();
      await expect(heading, name).not.toHaveText(/Das hat nicht geklappt|Nicht gefunden/);
      // The navigation shows where you are.
      await expect(sidebar.locator('a[aria-current="page"]'), name).toHaveAttribute('href', href);
    }
    errors.expectNone();
  });
});

test.describe('on the phone (390 px)', () => {
  test.use({ viewport: VIEWPORTS.phone, hasTouch: true });

  test('the five tabs work', async ({ page, errors }) => {
    await visit(page, '/');
    const tabs = page.getByRole('navigation', { name: NAV_LABEL }).getByRole('link');
    await expect(tabs).toHaveCount(5);
    await expect(tabs).toHaveText(['Cockpit', 'Lager', 'Erfassen', 'Rezepte', 'Mehr']);

    // From the last tab back to the first, so the first tap already changes the page.
    for (const index of [4, 3, 2, 1, 0]) {
      const tab = tabs.nth(index);
      const href = (await tab.getAttribute('href')) ?? '';
      await tab.tap();
      await expect(page).toHaveURL(href);
      await expect(page.getByRole('heading', title)).toBeVisible();
      await expect(tab).toHaveAttribute('aria-current', 'page');
      await expect(tabs.and(page.locator('[aria-current="page"]'))).toHaveCount(1);
    }
    errors.expectNone();
  });
});

test('works without a network after the first load', async ({ page, context, errors }) => {
  await visit(page, '/');
  // The service worker has stored every file of the app and answers for this page.
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', title)).toBeVisible();
  const navigation = page.getByRole('navigation', { name: NAV_LABEL });
  await expect(navigation).toBeVisible();

  // Inside the app, and by its address (a page whose code is loaded only when needed).
  await navigation.getByRole('link', { name: 'Lager', exact: true }).click();
  await expect(page).toHaveURL('/stock');
  await expect(page.getByRole('heading', title)).toBeVisible();
  await visit(page, '/styleguide');
  await visit(page, '/more');
  expect(await page.evaluate(() => navigator.onLine)).toBe(false);
  errors.expectNone();
});

test('answers with headers that keep the data on the device and the app out of search engines', async ({
  page,
  request,
}) => {
  const response = await page.goto('/');
  const headers = response?.headers() ?? {};
  const policy = headers['content-security-policy'] ?? '';
  expect(policy).toContain("default-src 'self'");
  expect(policy).toMatch(/(^|;\s*)connect-src 'self'\s*(;|$)/);
  expect(policy).toMatch(/(^|;\s*)frame-ancestors 'none'\s*(;|$)/);
  expect(policy).not.toMatch(/https?:/);
  expect(headers['x-robots-tag']).toContain('noindex');
  await expect(page.locator('head meta[name="robots"]')).toHaveAttribute('content', /noindex/);

  // The same policy on a deep link, on the service worker and on its files.
  for (const path of ['/stock/expiring', '/sw.js', '/manifest.webmanifest', '/icon.svg']) {
    const answer = await request.get(path);
    expect(answer.ok(), path).toBe(true);
    expect(answer.headers()['content-security-policy'], path).toBe(policy);
    expect(answer.headers()['x-robots-tag'], path).toContain('noindex');
  }
  // Updates must not get stuck behind a cached service worker.
  expect((await request.get('/sw.js')).headers()['cache-control']).toBe('no-cache');
});

test('home screen icons for iPhone, iPad and Android are there', async ({ page, request }) => {
  await page.goto('/');
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute(
    'href',
    '/apple-touch-icon.png',
  );
  const manifestUrl = await page.locator('link[rel="manifest"]').getAttribute('href');
  const manifest = (await (await request.get(manifestUrl ?? '')).json()) as {
    name: string;
    icons: { src: string; sizes: string; purpose: string }[];
  };
  expect(manifest.name).toBe('Randen');
  expect(manifest.icons.map((icon) => `${icon.sizes} ${icon.purpose}`)).toEqual(
    expect.arrayContaining(['192x192 any', '512x512 any', '512x512 maskable']),
  );
  for (const file of ['/apple-touch-icon.png', ...manifest.icons.map((icon) => `/${icon.src}`)]) {
    const response = await request.get(file);
    expect(response.ok(), file).toBe(true);
    expect(response.headers()['content-type'], file).toMatch(/^image\//);
  }
});
