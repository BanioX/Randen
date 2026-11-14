import type { Page } from '@playwright/test';
import { expect, NAV_LABEL, navDestinations, test, VIEWPORTS, visit } from './test';

type NavigationKind = 'tabs' | 'side';

/**
 * Which navigation is on screen, told by where it sits and not by a class name: the tab bar
 * spans the bottom edge, the side navigation the left edge from top to bottom.
 */
async function navigationOnScreen(page: Page): Promise<NavigationKind[]> {
  return page.locator(`nav[aria-label="${NAV_LABEL}"]`).evaluateAll((navs) =>
    navs.flatMap((nav): ('tabs' | 'side')[] => {
      const box = nav.getBoundingClientRect();
      if (box.width === 0 || box.height === 0 || getComputedStyle(nav).visibility === 'hidden') {
        return [];
      }
      // Without a scroll bar, in case the browser draws one.
      const screenWidth = document.documentElement.clientWidth;
      const atBottom = Math.abs(box.bottom - window.innerHeight) <= 1;
      const fullWidth = Math.abs(box.width - screenWidth) <= 1;
      const fullHeight = Math.abs(box.height - window.innerHeight) <= 1;
      if (atBottom && fullWidth && !fullHeight) {
        return ['tabs'];
      }
      if (box.left === 0 && fullHeight && box.width < screenWidth / 2) {
        return ['side'];
      }
      throw new Error(`A navigation sits in an unknown place: ${JSON.stringify(box)}`);
    }),
  );
}

/** Every page of the navigation, and the style guide with every building block. */
async function pagesToCheck(page: Page): Promise<string[]> {
  await visit(page, '/');
  return [...new Set([...(await navDestinations(page)), '/styleguide'])];
}

for (const [device, viewport] of Object.entries(VIEWPORTS)) {
  test.describe(`${device} (${String(viewport.width)} px)`, () => {
    test.use({ viewport });

    test('no page scrolls sideways', async ({ page }) => {
      test.slow();
      const tooWide: string[] = [];
      for (const route of await pagesToCheck(page)) {
        await visit(page, route);
        const { content, screen } = await page.evaluate(() => ({
          content: document.documentElement.scrollWidth,
          screen: document.documentElement.clientWidth,
        }));
        if (content > screen) {
          tooWide.push(`${route} is ${String(content)} px wide on ${String(screen)} px`);
        }
      }
      expect(tooWide).toEqual([]);
    });

    test('shows exactly one navigation, where this device expects it', async ({ page }) => {
      await visit(page, '/');
      const expected: Record<string, NavigationKind[][]> = {
        // Thumbs reach the bottom edge.
        phone: [['tabs']],
        // An iPad upright: the narrow rail, so tables keep their width (ADR-0013).
        tablet: [['side']],
        tabletLandscape: [['side']],
        desktop: [['side']],
      };
      expect(expected[device]).toContainEqual(await navigationOnScreen(page));
    });

    test('nothing ends behind the tab bar', async ({ page }) => {
      test.slow();
      const hidden: string[] = [];
      for (const route of await pagesToCheck(page)) {
        await visit(page, route);
        const { lowest, barTop } = await page.evaluate((label) => {
          window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' });
          // The bar is the navigation at the bottom edge; without one (side navigation) the
          // page may use the whole height.
          const bar = [...document.querySelectorAll(`nav[aria-label="${label}"]`)]
            .map((nav) => nav.getBoundingClientRect())
            .find((box) => box.height > 0 && box.height < window.innerHeight);
          const content = [...document.querySelectorAll('main *')]
            .map((element) => element.getBoundingClientRect())
            .filter((box) => box.width > 0 && box.height > 0);
          return {
            lowest: Math.max(0, ...content.map((box) => box.bottom)),
            barTop: bar?.top ?? window.innerHeight,
          };
        }, NAV_LABEL);
        expect(lowest, `${route} has content`).toBeGreaterThan(0);
        if (lowest > barTop + 0.5) {
          hidden.push(
            `${route}: content ends at ${String(lowest)} px, the bar starts at ${String(barTop)} px`,
          );
        }
      }
      expect(hidden).toEqual([]);
    });
  });
}

// The two widths around which the navigation changes sides, whatever the device is called.
for (const [width, kind] of [
  [767, 'tabs'],
  [768, 'side'],
  [1024, 'side'],
] as const) {
  test(`at ${String(width)} px the navigation is ${kind === 'tabs' ? 'the tab bar' : 'at the side'}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await visit(page, '/');
    expect(await navigationOnScreen(page)).toEqual([kind]);
  });
}
