import { addDays, ArticleSchema } from '@randen/core';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderApp, type AppView } from '../../app/test-helpers';
import { StockPage } from './StockPage';

/**
 * The test kitchen on 14.11.2026 holds CHF 537.00 in ten lots of nine articles (see
 * `seedKitchen`). Every list is in the page twice, as the phone's grouped list and as the table
 * from tablet width; CSS shows one of them, the tests read the table unless they say otherwise.
 */
const table = (name: string | RegExp) => screen.findByRole('table', { name });

/** The calendar moves on while the app is open: the app notices when it comes back to the front. */
function moveDays(view: AppView, days: number) {
  view.t.clock.setToday(addDays(view.t.clock.today(), days));
  fireEvent(document, new Event('visibilitychange'));
}

describe('StockPage, «Bestand»', () => {
  it('shows the key figures and every article in stock', async () => {
    await renderApp(<StockPage />, { route: '/stock' });
    expect(await screen.findByRole('heading', { level: 1, name: 'Lager' })).toBeTruthy();
    const stock = await table('Bestand je Artikel');
    expect(screen.getByText('Lagerwert')).toBeTruthy();
    expect(screen.getByText('537.00')).toBeTruthy();
    expect(screen.getByText('9 Artikel in 2 Lagerbereichen')).toBeTruthy();
    // Lachs (tomorrow) and Entrecôte (in two days) are due within three days.
    const soon = screen.getByRole('link', { name: /In 3 Tagen/ });
    expect(within(soon).getByText('2 Chargen')).toBeTruthy();
    expect(within(soon).getByText('Wert CHF 305.00')).toBeTruthy();
    expect(soon.getAttribute('href')).toBe('/stock/expiring?group=soon');
    const today = screen.getByRole('link', { name: /Läuft heute ab/ });
    expect(within(today).getByText('0 Chargen')).toBeTruthy();
    expect(within(today).getByText('Nichts fällig')).toBeTruthy();
    const belowMin = screen.getByRole('link', { name: /Unter Mindestbestand/ });
    expect(within(belowMin).getByText('1 Artikel')).toBeTruthy();
    expect(belowMin.getAttribute('href')).toBe('/stock?filter=below_min');

    const rows = within(stock).getAllByRole('row');
    // Header, nine articles, the totals.
    expect(rows).toHaveLength(11);
    const cream = within(stock).getByRole('row', { name: /Vollrahm/ });
    expect(within(cream).getByText('8 l')).toBeTruthy();
    expect(within(cream).getByText('CHF 51.20')).toBeTruthy();
    expect(within(cream).getByText(/in 6 Tagen/)).toBeTruthy();
    expect(
      within(cream)
        .getByRole('link', { name: /Vollrahm/ })
        .getAttribute('href'),
    ).toMatch(/^\/stock\/articles\//);
    const flour = within(stock).getByRole('row', { name: /Weissmehl/ });
    expect(within(flour).getByText('Mindestbestand 5 kg')).toBeTruthy();
    expect(within(flour).getByText('ohne Datum')).toBeTruthy();
    expect(within(stock).getByText('Gezeigter Bestand: 9 Artikel')).toBeTruthy();
    expect(within(stock).getByText('CHF 537.00')).toBeTruthy();
    // The same on the phone: name, quantity and place, and what has to be reordered.
    const list = screen.getByRole('list', { name: 'Bestand je Artikel' });
    expect(within(list).getByText('3 kg · Mindestbestand 5 kg')).toBeTruthy();
    expect(within(list).getByText('nachbestellen')).toBeTruthy();
    expect(within(list).getByText('8 l · Kühlzelle · 2 Chargen')).toBeTruthy();
    // The main action and the ways on.
    expect(screen.getByRole('link', { name: 'Wareneingang' }).getAttribute('href')).toBe(
      '/stock/receive',
    );
    expect(screen.getByRole('link', { name: /Inventur/ }).getAttribute('href')).toBe(
      '/stock/count',
    );
    expect(screen.getByRole('link', { name: /Journal/ }).getAttribute('href')).toBe(
      '/stock/journal',
    );
  });

  it('narrows the list by search and area, and keeps both in the address', async () => {
    const { user, router } = await renderApp(<StockPage />, { route: '/stock' });
    const stock = await table('Bestand je Artikel');
    await user.type(screen.getByLabelText('Artikel suchen'), 'entrecote');
    await waitFor(() => {
      expect(within(stock).queryByRole('row', { name: /Butter/ })).toBeNull();
    });
    expect(within(stock).getByRole('row', { name: /Rindsentrecôte/ })).toBeTruthy();
    expect(router.state.location.search).toBe('?q=entrecote');
    expect(within(stock).getByText('Gezeigter Bestand: 1 Artikel')).toBeTruthy();
    // The key figures stay those of the whole store.
    expect(screen.getByText('537.00')).toBeTruthy();

    await user.type(screen.getByLabelText('Artikel suchen'), 'x');
    expect(await screen.findByText('Kein Artikel passt zu dieser Auswahl.')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Suche leeren' }));
    await user.click(await screen.findByRole('radio', { name: 'Trockenlager' }));
    const dry = await table('Bestand je Artikel');
    await waitFor(() => {
      expect(within(dry).getAllByRole('row')).toHaveLength(6);
    });
    expect(within(dry).queryByRole('row', { name: /Vollrahm/ })).toBeNull();
    expect(within(dry).getByRole('row', { name: /Zwiebeln/ })).toBeTruthy();
    expect(router.state.location.search).toMatch(/^\?area=/);
    await user.click(screen.getByRole('radio', { name: 'Alle' }));
    await waitFor(() => {
      expect(router.state.location.search).toBe('');
    });
  });

  it('shows only what is under its minimum when the tile led here', async () => {
    await renderApp(<StockPage />, { route: '/stock?filter=below_min' });
    const stock = await table('Bestand je Artikel');
    expect(within(stock).getAllByRole('row')).toHaveLength(3);
    expect(within(stock).getByRole('row', { name: /Weissmehl/ })).toBeTruthy();
    expect(screen.getByText('Gezeigt werden nur Artikel unter dem Mindestbestand.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Alle anzeigen' }).getAttribute('href')).toBe('/stock');
  });

  it('points to the expiry list when a lot is past its Verbrauchsdatum', async () => {
    const view = await renderApp(<StockPage />, { route: '/stock' });
    await table('Bestand je Artikel');
    expect(screen.queryByText(/über dem Verbrauchsdatum/)).toBeNull();
    moveDays(view, 2);
    expect(await screen.findByText('1 Charge ist über dem Verbrauchsdatum.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Ablauf ansehen' }).getAttribute('href')).toBe(
      '/stock/expiring?group=expired',
    );
    const today = screen.getByRole('link', { name: /Läuft heute ab/ });
    expect(within(today).getByText('1 Charge')).toBeTruthy();
    expect(within(today).getByText('Wert CHF 248.00')).toBeTruthy();
  });

  it('offers goods receipt and the opening stock while nothing is in the house', async () => {
    const view = await renderApp(<StockPage />, { route: '/stock' });
    await table('Bestand je Artikel');
    const { t, kitchen } = view;
    await t.useCases['stock.count']({
      commandId: t.cmd(),
      businessId: t.businessId,
      countedOn: t.clock.today(),
      lines: Object.values(kitchen.lots).map((lot) => ({ lotId: lot.id, counted: 0 })),
    });
    await t.storage.articles.put(ArticleSchema.parse({ ...kitchen.articles.flour, minStock: 0 }));
    expect(await screen.findByText('Noch nichts an Lager', { selector: 'p' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Wareneingang buchen' }).getAttribute('href')).toBe(
      '/stock/receive',
    );
    expect(screen.getByRole('link', { name: 'Anfangsbestand erfassen' }).getAttribute('href')).toBe(
      '/stock/receive?mode=opening',
    );
    expect(screen.getByText('0.00')).toBeTruthy();
  });
});

describe('StockPage, «Ablauf»', () => {
  it('lists the lots that are due in groups, with a way to write off and into the menu plan', async () => {
    const { kitchen } = await renderApp(<StockPage />, { route: '/stock/expiring' });
    const soon = await table('In 3 Tagen');
    expect(screen.getByRole('radio', { name: 'Ablauf' }).getAttribute('aria-checked')).toBe('true');
    const salmon = within(soon).getByRole('row', { name: /Lachsfilet/ });
    expect(within(salmon).getByText('1.5 kg')).toBeTruthy();
    expect(within(salmon).getByText('CHF 57.00')).toBeTruthy();
    expect(within(salmon).getByText('morgen')).toBeTruthy();
    expect(
      within(salmon)
        .getByRole('link', { name: 'Abschreiben, Lachsfilet 1.5 kg' })
        .getAttribute('href'),
    ).toBe(`/stock/waste?lot=${kitchen.lots.salmon.id}`);
    const entrecote = within(soon).getByRole('row', { name: /Rindsentrecôte/ });
    expect(within(entrecote).getByText('Schublade Fleisch')).toBeTruthy();
    expect(await table('Diese Woche')).toBeTruthy();
    // One way into the menu plan, at the first group that can still be cooked.
    const plan = screen.getAllByRole('link', { name: 'Im Menüplan verwerten' });
    expect(plan).toHaveLength(1);
    expect(plan[0]?.getAttribute('href')).toBe('/plan');
    expect(screen.queryByText(/nicht mehr verwenden/i)).toBeNull();
  });

  it('puts what is past its Verbrauchsdatum first and writes all of it off in one go', async () => {
    const view = await renderApp(<StockPage />, { route: '/stock/expiring' });
    const { user, t, kitchen } = view;
    await table('In 3 Tagen');
    moveDays(view, 2);
    const expired = await table('Nicht mehr verwenden');
    // The first group of the page is the one that must go.
    expect(screen.getAllByRole('table')[0]).toBe(expired);
    expect(within(expired).getByRole('row', { name: /Lachsfilet/ })).toBeTruthy();
    expect(within(expired).getByText(/abgelaufen seit gestern/)).toBeTruthy();
    expect(screen.getByText('1 Charge nicht mehr verwenden')).toBeTruthy();
    expect(screen.getByText(/Wert CHF 57\.00\./)).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Alle abschreiben' }));
    const dialog = await screen.findByRole('alertdialog', { name: '1 Charge abschreiben?' });
    expect(
      within(dialog).getByText(
        'Lachsfilet 1.5 kg. Wert CHF 57.00. Die Ware geht mit dem Grund «Abgelaufen» als Abschreiber ins Journal.',
      ),
    ).toBeTruthy();
    await user.click(within(dialog).getByRole('button', { name: 'Abschreiben' }));
    await waitFor(() => {
      expect(screen.queryByRole('table', { name: 'Nicht mehr verwenden' })).toBeNull();
    });
    expect(screen.queryByText('1 Charge nicht mehr verwenden')).toBeNull();
    expect(await t.storage.lots.get(kitchen.lots.salmon.id)).toMatchObject({
      quantity: 0,
      status: 'depleted',
    });
    const waste = (await t.storage.movements.ofBusiness(t.businessId)).filter(
      (movement) => movement.type === 'waste',
    );
    expect(waste).toHaveLength(1);
    expect(waste[0]).toMatchObject({ quantity: -1500, valueRappen: -5700, reason: 'expired' });
    // The entrecôte is due today and stays: it can still be cooked.
    expect(await table('Heute')).toBeTruthy();
  });

  it('shows one group alone when a tile led here', async () => {
    await renderApp(<StockPage />, { route: '/stock/expiring?group=week' });
    expect(await table('Diese Woche')).toBeTruthy();
    expect(screen.queryByRole('table', { name: 'In 3 Tagen' })).toBeNull();
    expect(screen.getByText('Gezeigt wird nur «Diese Woche».')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Alle anzeigen' }).getAttribute('href')).toBe(
      '/stock/expiring',
    );
  });

  it('says so when nothing is due', async () => {
    const { t, kitchen } = await renderApp(<StockPage />, { route: '/stock/expiring' });
    await table('In 3 Tagen');
    for (const lot of [kitchen.lots.salmon, kitchen.lots.entrecote, kitchen.lots.creamOld]) {
      await t.useCases['stock.writeOff']({
        commandId: t.cmd(),
        businessId: t.businessId,
        lotId: lot.id,
        quantity: lot.quantity,
        reason: 'other',
      });
    }
    expect(await screen.findByText('Nichts läuft ab')).toBeTruthy();
    expect(screen.getByText('In den nächsten sieben Tagen ist keine Charge fällig.')).toBeTruthy();
  });

  it('switches between the two views by their addresses', async () => {
    const { user, router } = await renderApp(<StockPage />, { route: '/stock' });
    await table('Bestand je Artikel');
    await user.click(screen.getByRole('radio', { name: 'Ablauf' }));
    expect(await table('In 3 Tagen')).toBeTruthy();
    expect(router.state.location.pathname).toBe('/stock/expiring');
    await user.click(screen.getByRole('radio', { name: 'Bestand' }));
    expect(await table('Bestand je Artikel')).toBeTruthy();
    expect(router.state.location.pathname).toBe('/stock');
  });
});

describe('StockPage, «Ablauf» with the functions of the business', () => {
  it('offers the way into the menu plan only with the planning', async () => {
    const view = await renderApp(<StockPage />, { route: '/stock/expiring' });
    await table('In 3 Tagen');
    expect(screen.getAllByRole('link', { name: 'Im Menüplan verwerten' }).length).toBeGreaterThan(
      0,
    );
    await view.t.useCases['business.update']({
      commandId: view.t.cmd(),
      businessId: view.t.businessId,
      modules: ['menu_card', 'ordering'],
    });
    await waitFor(() => {
      expect(screen.queryByRole('link', { name: 'Im Menüplan verwerten' })).toBeNull();
    });
    expect(screen.getByRole('table', { name: 'In 3 Tagen' })).toBeTruthy();
  }, 20_000);
});
