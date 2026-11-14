import { AxeBuilder, expect, NAV_LABEL, test, VIEWPORTS } from './test';

test.describe('a new business', () => {
  test.use({ newBusiness: true, viewport: VIEWPORTS.desktop });

  test('starts with the essentials and switches the extras on, group by group', async ({
    page,
  }) => {
    await page.goto('/');
    const side = page.locator(`nav[aria-label="${NAV_LABEL}"]`).first();
    await expect(side.getByRole('link', { name: 'Lager' })).toBeVisible();
    await expect(side.getByRole('link', { name: 'Speisekarte' })).toBeVisible();
    await expect(side.getByRole('link', { name: 'Selbstkontrolle' })).toBeVisible();
    for (const hidden of ['Produktion', 'Menüplan', 'Zahlen', 'Wo ist was?']) {
      await expect(side.getByRole('link', { name: hidden })).toHaveCount(0);
    }

    await page.goto('/more/features');
    await expect(page.getByRole('heading', { level: 1, name: 'Funktionen' })).toBeVisible();
    const extended = page.getByRole('switch', { name: /Erweitert/ });
    await expect(extended).not.toBeChecked();
    await expect(page.getByRole('switch', { name: /Zahlen und Auswertung/ })).toHaveCount(0);

    await extended.click();
    await expect(extended).toBeChecked();
    const numbers = page.getByRole('switch', { name: /Zahlen und Auswertung/ });
    await expect(numbers).toBeChecked();
    await numbers.click();
    await expect(numbers).not.toBeChecked();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

    // The choice stays on this device and the navigation follows it.
    await page.reload();
    await expect(page.getByRole('switch', { name: /Zahlen und Auswertung/ })).not.toBeChecked();
    await expect(side.getByRole('link', { name: 'Produktion' })).toBeVisible();
    await expect(side.getByRole('link', { name: 'Wo ist was?' })).toBeVisible();
    await expect(side.getByRole('link', { name: 'Zahlen' })).toHaveCount(0);
  });
});

test('a business that exists keeps every function', async ({ page }) => {
  await page.setViewportSize(VIEWPORTS.desktop);
  await page.goto('/');
  const side = page.locator(`nav[aria-label="${NAV_LABEL}"]`).first();
  for (const shown of ['Produktion', 'Menüplan', 'Zahlen', 'Wo ist was?']) {
    await expect(side.getByRole('link', { name: shown })).toBeVisible();
  }
});
