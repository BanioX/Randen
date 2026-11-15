import { AxeBuilder, expect, NAV_LABEL, test, VIEWPORTS } from './test';

test.describe('a new business', () => {
  test.use({ newBusiness: true, viewport: VIEWPORTS.desktop });

  test('starts with the essentials and sets itself up as a kebab shop at the cash & carry', async ({
    page,
  }) => {
    await page.goto('/');
    const side = page.locator(`nav[aria-label="${NAV_LABEL}"]`).first();
    await expect(side.getByRole('link', { name: 'Lager' })).toBeVisible();
    await expect(side.getByRole('link', { name: 'Speisekarte' })).toBeVisible();
    for (const hidden of ['Produktion', 'Menüplan', 'Zahlen', 'Wo ist was?']) {
      await expect(side.getByRole('link', { name: hidden })).toHaveCount(0);
    }

    // The cockpit offers the setup; it never blocks.
    await page.getByRole('link', { name: 'Einrichten' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Randen einrichten' })).toBeVisible();
    await page.getByRole('button', { name: 'Einrichten' }).click();
    await page.getByText('Imbiss und Take-away').click();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.getByRole('button', { name: 'Weiter' }).click();
    await page.getByRole('button', { name: 'Weiter' }).click();
    await page.getByText('Ich allein oder zu zweit').click();
    await page.getByRole('button', { name: 'Weiter' }).click();
    await page.getByText('Sie nehmen es mit').click();
    await page.getByRole('button', { name: 'Weiter' }).click();
    await page.getByRole('textbox', { name: /Name des Betriebs/ }).fill('Imbiss am Bach');
    await page.getByRole('button', { name: 'Weiter' }).click();
    await expect(page.getByRole('switch', { name: /Einkauf im Markt/ })).toBeChecked();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.getByRole('button', { name: 'Fertig' }).click();

    await expect(page.getByText('Randen ist eingerichtet.')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Einrichten' })).toHaveCount(0);
    await expect(side.getByRole('link', { name: 'Einkauf' })).toBeVisible();
    await expect(side.getByRole('link', { name: 'Rezepte' })).toBeVisible();
    await expect(side.getByRole('link', { name: 'Zahlen' })).toHaveCount(0);

    // «Funktionen» switches a function of the business; it stays after a reload.
    await page.goto('/more/features');
    await expect(page.getByText('Imbiss und Take-away')).toBeVisible();
    const numbers = page.getByRole('switch', { name: /Budget und Zahlen/ });
    await expect(numbers).not.toBeChecked();
    await numbers.click();
    await expect(numbers).toBeChecked();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.reload();
    await expect(page.getByRole('switch', { name: /Budget und Zahlen/ })).toBeChecked();
    await expect(side.getByRole('link', { name: 'Zahlen' })).toBeVisible();
  });

  test('puts the shopping list into the tab bar of the phone', async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.phone);
    await page.goto('/setup');
    await page.getByRole('button', { name: 'Einrichten' }).click();
    const next = page.getByRole('button', { name: 'Weiter' });
    await page.getByText('Imbiss und Take-away').click();
    await next.click();
    // Where the goods come from is proposed by the kind: fetched at the market.
    await next.click();
    await page.getByText('Ich allein oder zu zweit').click();
    await next.click();
    await page.getByText('Hier, an Tischen oder an der Theke').click();
    await next.click();
    // The name stays as it is.
    await next.click();
    await page.getByRole('button', { name: 'Fertig' }).click();
    const tabs = page.locator(`nav[aria-label="${NAV_LABEL}"]`).last();
    await expect(tabs.getByRole('link')).toHaveText([
      'Cockpit',
      'Lager',
      'Erfassen',
      'Einkauf',
      'Mehr',
    ]);
  });
});

test('a business that exists keeps every function', async ({ page }) => {
  await page.setViewportSize(VIEWPORTS.desktop);
  await page.goto('/');
  const side = page.locator(`nav[aria-label="${NAV_LABEL}"]`).first();
  for (const shown of ['Produktion', 'Menüplan', 'Zahlen', 'Wo ist was?', 'Auslieferung']) {
    await expect(side.getByRole('link', { name: shown })).toBeVisible();
  }
});
