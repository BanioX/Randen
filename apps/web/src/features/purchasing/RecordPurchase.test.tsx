import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { paths } from '../../app/paths';
import { renderApp } from '../../app/test-helpers';
import { purchasingMessages } from './messages';
import { PurchasingPage } from './PurchasingPage';
import { addMarket } from './testdata';

const t = purchasingMessages.record;

/** «Einkauf erfassen» is a view of the purchasing page (`?view=record`). */
function openRecord() {
  return renderApp(<PurchasingPage />, {
    route: `${paths.purchasing()}?view=record`,
    path: paths.purchasing(),
  });
}

// Every test renders the app on a fresh database: that takes a few seconds in the test runner.
describe('Einkauf erfassen', { timeout: 20_000 }, () => {
  it('asks for at least one line before a purchase is booked', async () => {
    const view = await openRecord();
    expect(await screen.findByRole('heading', { level: 1, name: t.title })).toBeTruthy();
    await view.user.click(await screen.findByRole('button', { name: t.submit }));
    expect(await screen.findByText(t.needLine)).toBeTruthy();
  });

  it('books goods bought at a market into stock, with the market as supplier', async () => {
    const view = await openRecord();
    await addMarket(view.t);
    await view.user.selectOptions(
      await screen.findByRole('combobox', { name: t.head.market }),
      'Markt Nord',
    );

    await view.user.type(screen.getByRole('combobox', { name: t.lines.add }), 'Lachs');
    await view.user.click(await screen.findByRole('option', { name: /Lachsfilet/ }));

    const line = await screen.findByRole('group', { name: t.lines.line(1, 'Lachsfilet') });
    await view.user.type(within(line).getByRole('textbox', { name: /^Menge/ }), '1.5');
    await view.user.type(within(line).getByRole('textbox', { name: /^Betrag/ }), '57.00');
    await view.user.click(screen.getByRole('button', { name: t.submit }));

    await waitFor(async () => {
      const deliveries = await view.t.storage.deliveries.ofBusiness(view.t.businessId);
      expect(deliveries).toHaveLength(1);
    });
    const [delivery] = await view.t.storage.deliveries.ofBusiness(view.t.businessId);
    expect(delivery?.supplierId).toBeDefined();
    const lots = await view.t.storage.lots.ofBusiness(view.t.businessId);
    const salmon = lots.find((lot) => lot.articleId === view.kitchen.articles.salmon.id);
    expect(salmon?.quantity).toBe(1500);
  });
});
