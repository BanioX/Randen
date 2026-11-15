import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { paths } from '../../app/paths';
import { renderApp } from '../../app/test-helpers';
import { OrderPage } from './OrderPage';
import { purchasingMessages } from './messages';
import { PurchasingPage } from './PurchasingPage';
import { buy, daysFrom, flourInSacks, planDish } from './testdata';

const t = purchasingMessages;
const wholesaler = 'Grosshandel Beispiel';

/** The page under test, plus the order page it links to. */
function openPage(route = paths.purchasing()) {
  return renderApp(<PurchasingPage />, {
    route,
    path: paths.purchasing(),
    routes: [{ path: '/purchasing/orders/:orderId', element: <OrderPage /> }],
  });
}

describe('PurchasingPage', () => {
  it('proposes flour in whole sacks and the salmon of the menu plan, per supplier', async () => {
    const view = await openPage();
    await flourInSacks(view.t, view.kitchen);
    await planDish(view.t, view.kitchen.recipes.salmonDish.id, 30, daysFrom(view.t, 3));

    const lines = await screen.findByRole('list', { name: t.proposal.linesOf(wholesaler) });
    const flour = within(lines).getByText('Weissmehl').closest('li');
    expect(flour?.textContent).toContain('2 Sack à 10 kg');
    expect(flour?.textContent).toContain('Bestand 3 kg');
    expect(flour?.textContent).toContain('Mindestbestand 5 kg');
    expect(within(flour as HTMLElement).getByText(t.reasons.below_min)).toBeTruthy();

    const salmon = within(lines).getByText('Lachsfilet').closest('li');
    expect(within(salmon as HTMLElement).getByText(t.reasons.plan)).toBeTruthy();
    // The supplier's days: the next order day and the delivery that comes with it.
    expect(screen.getByText('Bestellen Mo, 16.11. · Lieferung Di, 17.11.')).toBeTruthy();
    // The butcher has nothing to order: no card for it.
    expect(screen.queryByRole('heading', { level: 3, name: 'Metzgerei Muster' })).toBeNull();
  });

  it('says calmly that nothing is needed', async () => {
    const view = await openPage();
    await flourInSacks(view.t, view.kitchen);
    await view.t.useCases['articles.update']({
      commandId: view.t.cmd(),
      businessId: view.t.businessId,
      articleId: view.kitchen.articles.flour.id,
      minStock: null,
    });
    expect(await screen.findByText(t.proposal.empty)).toBeTruthy();
  });

  it('creates the draft of a supplier and opens it', async () => {
    const view = await openPage();
    await flourInSacks(view.t, view.kitchen);
    const button = await screen.findByRole('button', { name: t.proposal.createFor(wholesaler) });
    await view.user.click(button);

    expect(await screen.findByRole('heading', { level: 1, name: wholesaler })).toBeTruthy();
    const [order] = (await view.t.useCases['orders.list']({ businessId: view.t.businessId }))
      .orders;
    expect(order?.status).toBe('draft');
    expect(order?.lineCount).toBe(1);
  });

  it('shows the shopping list only, when the business has the market and no ordering', async () => {
    const view = await openPage();
    await view.t.useCases['business.update']({
      commandId: view.t.cmd(),
      businessId: view.t.businessId,
      modules: ['market'],
    });
    expect(await screen.findByRole('heading', { level: 2, name: t.shopping.title })).toBeTruthy();
    await waitFor(() => {
      expect(screen.queryByRole('heading', { level: 2, name: t.proposal.title })).toBeNull();
    });
    expect(screen.queryByRole('heading', { level: 2, name: t.openOrders.title })).toBeNull();
  });

  it('adds a free-text line at once when opened from the cockpit (?add=1)', async () => {
    const view = await openPage(`${paths.purchasing()}?add=1`);
    const dialog = await screen.findByRole('dialog', { name: t.shopping.addTitle });
    // Free text first: the field is there without a tap on the mode.
    await view.user.type(within(dialog).getByRole('textbox', { name: /^Text/ }), 'Servietten');
    await view.user.click(within(dialog).getByRole('button', { name: t.shopping.submitAdd }));

    expect(await screen.findByText('Servietten')).toBeTruthy();
    const list = await view.t.useCases['shopping.list']({ businessId: view.t.businessId });
    expect(list.groups.flatMap((group) => group.items).map((item) => item.name)).toContain(
      'Servietten',
    );
  });

  it('shows the price changes of the purchases, with the dishes that use the article', async () => {
    const view = await openPage();
    const today = view.t.clock.today();
    await buy(view.t, view.kitchen, view.kitchen.articles.flour.id, 160, daysFrom(view.t, -20));
    await buy(view.t, view.kitchen, view.kitchen.articles.flour.id, 200, today);

    expect(await screen.findByText(t.priceWatch.title)).toBeTruthy();
    expect(await screen.findByText(/CHF 1\.60 \/ kg → CHF 2\.00 \/ kg/)).toBeTruthy();
  });

  it('keeps the order list reachable from the proposal page', async () => {
    await openPage();
    expect(
      (await screen.findByRole('link', { name: t.overview.orders })).getAttribute('href'),
    ).toBe(paths.orders());
  });
});
