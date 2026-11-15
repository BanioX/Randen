import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { paths } from '../../app/paths';
import { renderApp } from '../../app/test-helpers';
import { OrdersPage } from './OrdersPage';
import { purchasingMessages } from './messages';

const t = purchasingMessages.orders;

describe('OrdersPage', () => {
  it('shows the empty state with the way to the proposal', async () => {
    await renderApp(<OrdersPage />, { route: paths.orders(), path: paths.orders() });
    expect(await screen.findByText(t.emptyTitle)).toBeTruthy();
    const links = screen.getAllByRole('link', { name: t.toProposal });
    expect(links.map((link) => link.getAttribute('href'))).toContain(paths.purchasing());
  });

  it('lists the open orders and narrows them by status in the address', async () => {
    const view = await renderApp(<OrdersPage />, { route: paths.orders(), path: paths.orders() });
    const flour = view.kitchen.articles.flour.id;
    await view.t.useCases['orders.create']({
      commandId: view.t.cmd(),
      businessId: view.t.businessId,
      supplierId: view.kitchen.suppliers.wholesaler.id,
      lines: [{ articleId: flour, quantity: 20_000 }],
    });
    const sent = await view.t.useCases['orders.create']({
      commandId: view.t.cmd(),
      businessId: view.t.businessId,
      supplierId: view.kitchen.suppliers.butcher.id,
      lines: [{ articleId: view.kitchen.articles.entrecote.id, quantity: 4000 }],
    });
    await view.t.useCases['orders.markSent']({
      commandId: view.t.cmd(),
      businessId: view.t.businessId,
      orderId: sent.orderId,
    });

    const list = await screen.findByRole('list', { name: t.caption });
    expect(within(list).getByText('Grosshandel Beispiel')).toBeTruthy();
    expect(within(list).getByText('Metzgerei Muster')).toBeTruthy();
    expect(within(list).getAllByRole('link')).toHaveLength(2);

    await view.user.click(screen.getByRole('radio', { name: t.filters.received }));
    expect(await screen.findByText(t.noMatch)).toBeTruthy();
    expect(view.router.state.location.search).toBe('?status=received');

    await view.user.click(screen.getByRole('radio', { name: t.filters.all }));
    expect(
      (await screen.findByRole('list', { name: t.caption })).querySelectorAll('a'),
    ).toHaveLength(2);
  });
});
