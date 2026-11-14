import { addDays } from '@randen/core';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderApp, type AppView } from '../../app/test-helpers';
import { StockArticlePage } from './StockArticlePage';

const PATH = '/stock/articles/:articleId';

async function open(pick: (kitchen: AppView['kitchen']) => string): Promise<AppView> {
  // The id of the article is only known once the kitchen is seeded: render, then navigate.
  const view = await renderApp(<StockArticlePage />, { path: PATH, route: '/stock/articles/x' });
  await view.router.navigate(`/stock/articles/${pick(view.kitchen)}`);
  return view;
}

function moveDays(view: AppView, days: number) {
  view.t.clock.setToday(addDays(view.t.clock.today(), days));
  fireEvent(document, new Event('visibilitychange'));
}

/** The list of the lots: the first list under the heading «Chargen». */
async function lotRows() {
  const section = await screen.findByRole('region', { name: 'Chargen' });
  return within(section).getAllByRole('listitem');
}

describe('StockArticlePage', () => {
  it('shows stock, value and what is usable, the lots first expired first, and the movements', async () => {
    const { kitchen } = await open((kitchen) => kitchen.articles.cream.id);
    expect(await screen.findByRole('heading', { level: 1, name: 'Vollrahm' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Lager' }).getAttribute('href')).toBe('/stock');
    expect(screen.getByRole('link', { name: 'Stammdaten' }).getAttribute('href')).toBe(
      `/articles/${kitchen.articles.cream.id}`,
    );
    // Two lots: 3 l and 5 l at CHF 6.40 / l.
    expect(screen.getByText('2 Chargen')).toBeTruthy();
    expect(screen.getByText('51.20')).toBeTruthy();
    expect(screen.getByText('zuletzt CHF 6.40 / l')).toBeTruthy();
    expect(screen.getByText('Alles verwendbar')).toBeTruthy();
    expect(screen.getByText('Nicht festgelegt')).toBeTruthy();

    const rows = await lotRows();
    expect(rows).toHaveLength(2);
    const [first, second] = rows as [HTMLElement, HTMLElement];
    expect(within(first).getByText('3 l')).toBeTruthy();
    expect(within(first).getByText(/in 6 Tagen/)).toBeTruthy();
    expect(within(first).getByText('zuerst verbrauchen')).toBeTruthy();
    expect(within(first).getByText('mindestens haltbar bis 20.11.2026')).toBeTruthy();
    expect(within(first).getByText('CHF 6.40 / l · Wert CHF 19.20')).toBeTruthy();
    expect(within(first).getByText('Grosshandel Beispiel · Eingang 13.11.2026')).toBeTruthy();
    expect(within(second).getByText('5 l')).toBeTruthy();
    expect(within(second).queryByText('zuerst verbrauchen')).toBeNull();
    // Three things to do with each lot, each named with its lot.
    for (const action of ['Entnehmen', 'Abschreiben', 'Verschieben']) {
      expect(
        within(first).getByRole('button', { name: `${action}, Charge 20.11.2026, 3 l` }),
      ).toBeTruthy();
    }
    const movements = await screen.findByRole('table', { name: 'Letzte Bewegungen' });
    expect(within(movements).getAllByRole('row')).toHaveLength(3);
    expect(within(movements).getAllByText('Wareneingang')).toHaveLength(2);
    expect(within(movements).getAllByText('Testperson')).toHaveLength(2);
    expect(screen.getByRole('link', { name: 'Journal' }).getAttribute('href')).toBe(
      '/stock/journal',
    );
    expect(screen.getByText('Letzter Preis')).toBeTruthy();
  });

  it('writes a part of a lot off through its sheet', async () => {
    const { user, t, kitchen } = await open((kitchen) => kitchen.articles.cream.id);
    const [first] = (await lotRows()) as [HTMLElement];
    await user.click(
      within(first).getByRole('button', { name: 'Abschreiben, Charge 20.11.2026, 3 l' }),
    );
    const dialog = await screen.findByRole('dialog', { name: 'Abschreiben' });
    const quantity = within(dialog).getByLabelText<HTMLInputElement>('Menge');
    // The whole rest of the lot is prefilled.
    expect(quantity.value).toBe('3');
    expect(within(dialog).getByText('3 l Vollrahm, CHF 19.20')).toBeTruthy();
    // Without a reason nothing is booked.
    await user.click(within(dialog).getByRole('button', { name: 'Abschreiben' }));
    expect(await within(dialog).findByText('Wähle den Grund.')).toBeTruthy();
    // More than the lot holds is said at the field.
    await user.clear(quantity);
    await user.type(quantity, '4');
    expect(
      await within(dialog).findByText('Die Charge hat 3 l. Trag höchstens so viel ein.'),
    ).toBeTruthy();
    await user.clear(quantity);
    await user.type(quantity, '1');
    await user.click(within(dialog).getByRole('radio', { name: 'Verdorben' }));
    await user.type(within(dialog).getByLabelText('Bemerkung'), 'Deckel offen');
    expect(within(dialog).getByText('1 l Vollrahm, CHF 6.40')).toBeTruthy();
    await user.click(within(dialog).getByRole('button', { name: 'Abschreiben' }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Abschreiben' })).toBeNull();
    });
    const [after] = (await lotRows()) as [HTMLElement];
    expect(await within(after).findByText('2 l von 3 l')).toBeTruthy();
    expect((await t.storage.lots.get(kitchen.lots.creamOld.id))?.quantity).toBe(2000);
    const waste = (await t.storage.movements.ofBusiness(t.businessId)).filter(
      (movement) => movement.type === 'waste',
    );
    expect(waste).toHaveLength(1);
    expect(waste[0]).toMatchObject({
      quantity: -1000,
      valueRappen: -640,
      reason: 'spoiled',
      note: 'Deckel offen',
    });
    const movements = screen.getByRole('table', { name: 'Letzte Bewegungen' });
    expect(await within(movements).findByText('Abschreiber · Verdorben')).toBeTruthy();
    expect(within(movements).getByText('CHF -6.40')).toBeTruthy();
  });

  it('takes a whole lot for the staff and moves another one', async () => {
    const { user, t, kitchen } = await open((kitchen) => kitchen.articles.cream.id);
    const [first] = (await lotRows()) as [HTMLElement];
    await user.click(
      within(first).getByRole('button', { name: 'Entnehmen, Charge 20.11.2026, 3 l' }),
    );
    const withdraw = await screen.findByRole('dialog', { name: 'Entnehmen' });
    await user.click(within(withdraw).getByRole('radio', { name: 'Personal' }));
    expect(within(withdraw).getByText('3 l Vollrahm, CHF 19.20')).toBeTruthy();
    await user.click(within(withdraw).getByRole('button', { name: 'Entnehmen' }));
    await waitFor(async () => {
      expect(await lotRows()).toHaveLength(1);
    });
    expect(await t.storage.lots.get(kitchen.lots.creamOld.id)).toMatchObject({
      quantity: 0,
      status: 'depleted',
    });
    const used = (await t.storage.movements.ofBusiness(t.businessId)).filter(
      (movement) => movement.type === 'consumption',
    );
    expect(used).toEqual([
      expect.objectContaining({ quantity: -3000, valueRappen: -1920, purpose: 'staff' }),
    ]);

    // The lot that is left moves to the freezer; the area it lies in is refused.
    const [rest] = (await lotRows()) as [HTMLElement];
    await user.click(
      within(rest).getByRole('button', { name: 'Verschieben, Charge 26.11.2026, 5 l' }),
    );
    const move = await screen.findByRole('dialog', { name: 'Verschieben' });
    expect(within(move).getByText('Liegt jetzt in: Kühlzelle')).toBeTruthy();
    await within(move).findByRole('option', { name: 'Tiefkühlzelle' });
    await user.selectOptions(within(move).getByLabelText('Neuer Lagerbereich'), 'Kühlzelle');
    expect(
      within(move).getByText('Die Charge liegt schon in diesem Lagerbereich. Wähle einen anderen.'),
    ).toBeTruthy();
    await user.selectOptions(within(move).getByLabelText('Neuer Lagerbereich'), 'Tiefkühlzelle');
    expect(within(move).getByText('5 l Vollrahm nach Tiefkühlzelle')).toBeTruthy();
    await user.click(within(move).getByRole('button', { name: 'Verschieben' }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Verschieben' })).toBeNull();
    });
    const [moved] = (await lotRows()) as [HTMLElement];
    expect(await within(moved).findByText('Tiefkühlzelle')).toBeTruthy();
    expect((await t.storage.lots.get(kitchen.lots.creamNew.id))?.areaId).toBe(
      kitchen.areas.frozen.id,
    );
  });

  it('does not offer to take from a lot past its Verbrauchsdatum, only to write it off', async () => {
    const view = await open((kitchen) => kitchen.articles.salmon.id);
    const { user, t, kitchen } = view;
    const [fresh] = (await lotRows()) as [HTMLElement];
    expect(within(fresh).getByRole('button', { name: /^Entnehmen/ })).toBeTruthy();
    moveDays(view, 2);
    expect(await screen.findByText('1.5 kg nicht mehr verwenden')).toBeTruthy();
    const [expired] = (await lotRows()) as [HTMLElement];
    expect(within(expired).getByText(/abgelaufen seit gestern/)).toBeTruthy();
    expect(within(expired).queryByRole('button', { name: /^Entnehmen/ })).toBeNull();
    // The contract refuses it as well.
    await expect(
      t.useCases['stock.withdraw']({
        commandId: t.cmd(),
        businessId: t.businessId,
        articleId: kitchen.articles.salmon.id,
        lotId: kitchen.lots.salmon.id,
        quantity: 100,
        purpose: 'kitchen',
      }),
    ).rejects.toMatchObject({ code: 'not_allowed' });
    // Writing it off knows the reason already.
    await user.click(within(expired).getByRole('button', { name: /^Abschreiben/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Abschreiben' });
    expect(
      within(dialog).getByRole<HTMLInputElement>('radio', { name: 'Abgelaufen' }).checked,
    ).toBe(true);
    await user.click(within(dialog).getByRole('button', { name: 'Abschreiben' }));
    expect(await screen.findByText('Nichts an Lager')).toBeTruthy();
    const waste = (await t.storage.movements.ofBusiness(t.businessId)).filter(
      (movement) => movement.type === 'waste',
    );
    expect(waste).toEqual([
      expect.objectContaining({ quantity: -1500, valueRappen: -5700, reason: 'expired' }),
    ]);
    const movements = screen.getByRole('table', { name: 'Letzte Bewegungen' });
    expect(await within(movements).findByText('Abschreiber · Abgelaufen')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Wareneingang buchen' })).toBeTruthy();
  });

  it('shows the minimum of an article that lies under it', async () => {
    await open((kitchen) => kitchen.articles.flour.id);
    expect(await screen.findByRole('heading', { level: 1, name: 'Weissmehl' })).toBeTruthy();
    expect(screen.getByText('Darunter, nachbestellen')).toBeTruthy();
    const [lot] = (await lotRows()) as [HTMLElement];
    expect(within(lot).getByText('ohne Datum')).toBeTruthy();
    // One lot alone needs no word about the order.
    expect(within(lot).queryByText('zuerst verbrauchen')).toBeNull();
    expect(screen.getByText('20 kg')).toBeTruthy();
  });

  it('says so when the article does not exist', async () => {
    const view = await renderApp(<StockArticlePage />, {
      path: PATH,
      route: '/stock/articles/keine-kennung',
    });
    expect(await screen.findByText('Diesen Artikel gibt es nicht mehr.')).toBeTruthy();
    await view.router.navigate(`/stock/articles/${view.t.cmd()}`);
    expect(await screen.findByRole('heading', { level: 1, name: 'Nicht gefunden' })).toBeTruthy();
  });
});
