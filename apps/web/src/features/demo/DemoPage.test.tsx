import { alive } from '@randen/core';
import { createTestContext } from '@randen/core/testing';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { AppDataProvider } from '../../app/AppData';
import { messages } from '../../app/messages';
import { paths } from '../../app/paths';
import { renderApp } from '../../app/test-helpers';
import { RandenDb } from '../../data/db';
import { dexieStorage } from '../../data/dexie-storage';
import { ToastProvider } from '../../ui/Toast';
import { DemoPage } from './DemoPage';
import { demoMessages as t } from './messages';

/** The page on a business as it is on its first day: nothing in it but the person. */
async function renderEmpty(options: { route?: string; onCleared?: () => void } = {}) {
  const db = new RandenDb(`test-${crypto.randomUUID()}`);
  const context = await createTestContext({ storage: dexieStorage(db) });
  const router = createMemoryRouter(
    [
      {
        path: '/more/demo',
        element: (
          <ToastProvider>
            <DemoPage
              {...(options.onCleared === undefined ? {} : { onCleared: options.onCleared })}
            />
          </ToastProvider>
        ),
      },
      { path: '/', element: <h1>Cockpit</h1> },
      { path: '*', element: <h1>Andere Seite</h1> },
    ],
    { initialEntries: [options.route ?? '/more/demo'] },
  );
  render(
    <AppDataProvider db={db} clock={context.clock} ids={context.ids}>
      <RouterProvider router={router} />
    </AppDataProvider>,
  );
  return { context, router, user: userEvent.setup() };
}

describe('DemoPage', () => {
  it('says what the demo is and loads it into an empty business with one tap', async () => {
    const cleared = vi.fn();
    const { context, user } = await renderEmpty({ onCleared: cleared });
    expect(await screen.findByRole('heading', { level: 1, name: t.title })).toBeTruthy();
    expect(await screen.findByText(t.subtitle.empty)).toBeTruthy();
    for (const sentence of t.intro) {
      expect(screen.getByText(sentence)).toBeTruthy();
    }
    // What it will hold, before it is loaded.
    expect(screen.getByText('5 Lagerbereiche mit 14 Plätzen und Fotos')).toBeTruthy();
    expect(screen.getByText('50 Artikel von 7 Lieferanten, mit Chargen und Daten')).toBeTruthy();
    expect(screen.getByText('11 Gerichte und 5 Komponenten mit Kalkulation')).toBeTruthy();
    expect(screen.getByText(t.promise.market(3))).toBeTruthy();
    expect(screen.getByText(t.promise.lunch(2, 15))).toBeTruthy();
    expect(screen.getByRole('link', { name: t.back }).getAttribute('href')).toBe(paths.more());

    await user.click(screen.getByRole('button', { name: t.load }));
    expect(screen.getByRole('progressbar', { name: t.progressLabel })).toBeTruthy();
    expect(screen.getByRole('button', { name: t.loading })).toHaveProperty('disabled', true);

    // The end of the load: the toast and the figures of the loaded demo.
    expect(await screen.findByText(t.loaded(50, 11, 8), {}, { timeout: 60_000 })).toBeTruthy();
    expect(await screen.findByText(t.subtitle.demo('Testküche'))).toBeTruthy();
    expect(screen.queryByRole('progressbar')).toBeNull();
    expect(screen.getByRole('link', { name: t.toCockpit }).getAttribute('href')).toBe(
      paths.cockpit(),
    );
    expect(screen.getByRole('link', { name: /^Rezepte/ }).getAttribute('href')).toBe(
      paths.recipes(),
    );
    expect(screen.getByRole('link', { name: /^Selbstkontrolle/ }).getAttribute('href')).toBe(
      paths.haccp(),
    );
    expect(screen.getByText('11 Gerichte, 5 Komponenten')).toBeTruthy();
    expect(screen.getByRole('link', { name: /^Mahlzeiten/ }).getAttribute('href')).toBe(
      paths.plan(),
    );
    // The purchasing row: the supplier deliveries, the market's receipts («Belege»), the orders.
    const deliveries = await context.storage.deliveries.ofBusiness(context.businessId);
    const markets = (await context.storage.suppliers.ofBusiness(context.businessId))
      .filter((supplier) => supplier.kind === 'market')
      .map((supplier) => supplier.id);
    const receipts = deliveries.filter(
      (delivery) => delivery.supplierId !== undefined && markets.includes(delivery.supplierId),
    ).length;
    expect(receipts).toBe(3);
    expect(
      screen.getByText(t.rows.purchasingText(deliveries.length - receipts, receipts, 2)),
    ).toBeTruthy();
    expect(screen.getByText('3 Belege vom Markt', { exact: false })).toBeTruthy();

    // The rows are there: the business holds the demo.
    const articles = alive(await context.storage.articles.ofBusiness(context.businessId));
    expect(articles).toHaveLength(50);
    expect((await context.storage.businesses.get(context.businessId))?.demo).toBe(true);

    // Remove it again: asked first, then gone, then the app starts over.
    await user.click(screen.getByRole('button', { name: t.remove }));
    const dialog = await screen.findByRole('alertdialog', { name: t.removeConfirmTitle });
    expect(within(dialog).getByText(t.removeConfirmText)).toBeTruthy();
    await user.click(within(dialog).getByRole('button', { name: messages.actions.cancel }));
    expect(cleared).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: t.remove }));
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: t.removeConfirm }),
    );
    await vi.waitFor(() => {
      expect(cleared).toHaveBeenCalledTimes(1);
    });
    expect(await context.storage.businesses.get(context.businessId)).toBeUndefined();
    expect(await context.storage.articles.ofBusiness(context.businessId)).toEqual([]);
  }, 90_000);

  it('loads at once with ?load=1 and then opens the cockpit', async () => {
    const { context, router } = await renderEmpty({ route: '/more/demo?load=1' });
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Cockpit' }, { timeout: 60_000 }),
    ).toBeTruthy();
    expect(router.state.location.pathname).toBe(paths.cockpit());
    expect((await context.storage.businesses.get(context.businessId))?.demo).toBe(true);
  }, 90_000);

  it('leaves a business with its own data alone and points to the backup', async () => {
    const { t: context } = await renderApp(<DemoPage />, { route: '/more/demo' });
    expect(await screen.findByText(t.ownTitle)).toBeTruthy();
    expect(screen.getByText(t.ownText)).toBeTruthy();
    expect(screen.getByRole('link', { name: t.toData }).getAttribute('href')).toBe(paths.data());
    expect(screen.queryByRole('button', { name: t.load })).toBeNull();
    expect(screen.queryByRole('button', { name: t.remove })).toBeNull();
    expect(alive(await context.storage.articles.ofBusiness(context.businessId))).toHaveLength(10);
  });
});
