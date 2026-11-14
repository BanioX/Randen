import { a11y, expect, navDestinations, test, VIEWPORTS, visit } from './test';

/**
 * Axe (WCAG 2.0, 2.1 and 2.2, A and AA) on the cockpit, on every page the navigation leads to
 * and on the style guide, which shows every building block of the UI kit: light and dark, on
 * the iPhone, on the iPad upright and on a desk. The style guide grows with the kit; whatever is on it is checked.
 */
for (const colorScheme of ['light', 'dark'] as const) {
  for (const device of ['phone', 'tablet', 'desktop'] as const) {
    test.describe(`${colorScheme}, ${device}`, () => {
      test.use({ colorScheme, viewport: VIEWPORTS[device] });

      test('axe finds nothing on any page of the navigation or the style guide', async ({
        page,
        errors,
      }) => {
        // About fifteen pages, each measured by axe: more than one ordinary test.
        test.setTimeout(180_000);
        await visit(page, '/');
        expect(await page.evaluate(() => matchMedia('(prefers-color-scheme: dark)').matches)).toBe(
          colorScheme === 'dark',
        );
        const routes = [...new Set(['/', ...(await navDestinations(page)), '/styleguide'])];

        const violations: string[] = [];
        for (const route of routes) {
          await visit(page, route);
          violations.push(...(await a11y(page)).map((violation) => `${route}  ${violation}`));
        }
        expect(violations).toEqual([]);
        errors.expectNone();
      });
    });
  }
}
