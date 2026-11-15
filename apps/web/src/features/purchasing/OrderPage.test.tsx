import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { paths } from '../../app/paths';
import { renderApp, type AppView } from '../../app/test-helpers';
import { OrderPage } from './OrderPage';
import { purchasingMessages } from './messages';
import { flourInSacks } from './testdata';

const t = purchasingMessages.order;
const p = purchasingMessages.proposal;

/** A draft to the wholesaler: two sacks of flour (20 kg, at 1.60 per kg). */
async function draftOrder(view: AppView): Promise<string> {
  await flourInSacks(view.t, view.kitchen);
  const { orderId } = await view.t.useCases['orders.create']({
    commandId: view.t.cmd(),
    businessId: view.t.businessId,
    supplierId: view.kitchen.suppliers.wholesaler.id,
    lines: [{ articleId: view.kitchen.articles.flour.id, quantity: 20_000 }],
    expectedOn: '2026-11-17',
    note: 'Bitte am Morgen liefern.',
  });
  return orderId;
}

/**
 * Opens the page of an order that `build` creates on the same database: the page is opened by
 * its address, as a link does.
 */
async function openOrder(build: (view: AppView) => Promise<string>) {
  const view = await renderApp(<p>Start</p>, {
    route: '/',
    path: '/',
    routes: [
      { path: '/purchasing/orders/:orderId', element: <OrderPage /> },
      { path: paths.purchasing(), element: <p>Einkauf-Übersicht</p> },
    ],
  });
  const orderId = await build(view);
  await view.router.navigate(paths.order(orderId));
  return { ...view, orderId };
}

// Every test renders the app on a fresh database: that takes a few seconds in the test runner.
describe('OrderPage', { timeout: 20_000 }, () => {
  it('shows the draft with its text to send, which has no prices and no sharp s', async () => {
    const { orderId, ...view } = await openOrder(draftOrder);

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Grosshandel Beispiel' }),
    ).toBeTruthy();
    expect(
      screen.getByText(t.subtitle(purchasingMessages.status.draft, '14.11.2026')),
    ).toBeTruthy();
    const list = screen.getByRole('list', { name: t.lines.caption });
    expect(within(list).getByText('Weissmehl')).toBeTruthy();
    expect(within(list).getByRole('button', { name: t.lines.removeOf('Weissmehl') })).toBeTruthy();

    const { text } = await view.t.useCases['orders.get']({
      businessId: view.t.businessId,
      orderId,
    });
    expect(text).toContain('Weissmehl');
    expect(text).toContain('Gewünschte Lieferung: Dienstag, 17.11.2026');
    expect(text).toContain('Bitte am Morgen liefern.');
    expect(text).not.toMatch(/CHF|Rappen| \/ kg/);
    expect(text).not.toContain('1.60');
    expect(text).not.toContain('ß');
    expect(screen.getByLabelText(t.text.title, { selector: 'pre' }).textContent).toBe(text);
  });

  it('saves a changed pack count and the stored line follows', async () => {
    const { orderId, ...view } = await openOrder(draftOrder);

    await view.user.click(await screen.findByRole('button', { name: p.moreOf('Weissmehl') }));
    expect(screen.getByText('Änderungen sichern')).toBeTruthy();
    await view.user.click(screen.getByRole('button', { name: t.save }));

    await waitFor(async () => {
      const order = await view.t.useCases['orders.get']({
        businessId: view.t.businessId,
        orderId,
      });
      expect(order.lines.map((line) => line.quantity)).toEqual([30_000]);
    });
    expect(
      within(await screen.findByRole('list', { name: t.lines.caption })).getByText(
        '3 Sack à 10 kg',
      ),
    ).toBeTruthy();
  });

  it('marks a sent order as sent once, twice is harmless, and offers the receipt', async () => {
    const { orderId, ...view } = await openOrder(draftOrder);

    await view.user.click(await screen.findByRole('button', { name: t.markSent }));
    const receive = await screen.findByRole('link', { name: t.receive });
    expect(receive.getAttribute('href')).toBe(paths.receive(orderId));
    expect(screen.getByText(t.subtitle(purchasingMessages.status.sent, '14.11.2026'))).toBeTruthy();

    const again = await view.t.useCases['orders.markSent']({
      commandId: view.t.cmd(),
      businessId: view.t.businessId,
      orderId,
    });
    expect(again.status).toBe('sent');
  });

  it('copies the text to the clipboard', async () => {
    const { orderId, ...view } = await openOrder(draftOrder);

    await view.user.click(await screen.findByRole('button', { name: t.text.copy }));
    const { text } = await view.t.useCases['orders.get']({
      businessId: view.t.businessId,
      orderId,
    });
    expect(await navigator.clipboard.readText()).toBe(text);
  });

  it('cancels after a confirmation and keeps the order in the list', async () => {
    const view = await openOrder(draftOrder);

    await view.user.click(await screen.findByRole('button', { name: t.cancel }));
    const dialog = await screen.findByRole('alertdialog', { name: t.cancelTitle });
    await view.user.click(within(dialog).getByRole('button', { name: t.cancel }));

    expect(
      await screen.findByText(t.subtitle(purchasingMessages.status.cancelled, '14.11.2026')),
    ).toBeTruthy();
    expect(screen.getByText(t.notice.cancelled)).toBeTruthy();
  });

  it('deletes a draft and returns to the proposal', async () => {
    const view = await openOrder(draftOrder);

    await view.user.click(await screen.findByRole('button', { name: t.remove }));
    const dialog = await screen.findByRole('alertdialog', { name: t.removeTitle });
    await view.user.click(within(dialog).getByRole('button', { name: t.remove }));

    expect(await screen.findByText('Einkauf-Übersicht')).toBeTruthy();
    expect(await view.t.useCases['orders.list']({ businessId: view.t.businessId })).toMatchObject({
      orders: [],
    });
  });

  it('says that an order is gone when its address is old', async () => {
    await openOrder((view) => Promise.resolve(view.t.cmd()));
    expect(await screen.findByRole('heading', { level: 1, name: 'Nicht gefunden' })).toBeTruthy();
  });
});
