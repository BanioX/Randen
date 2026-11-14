import { screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderApp } from '../../app/test-helpers';
import { CountPage } from './CountPage';

afterEach(() => {
  vi.restoreAllMocks();
});

/** The field for the counted quantity of a lot, named with article and date. */
const counted = (name: RegExp) => screen.findByLabelText<HTMLInputElement>(name);

describe('CountPage', () => {
  it('finds 54 instead of 60 eggs: the stock is 54, the journal holds −6 Stk. worth CHF −2.70', async () => {
    const { user, t, kitchen } = await renderApp(<CountPage />, { route: '/stock/count' });
    expect(await screen.findByRole('heading', { level: 1, name: 'Inventur' })).toBeTruthy();
    const eggs = await counted(/^Gezählt, Eier/);
    // Ten lots in two areas; nothing is counted yet.
    expect(screen.getByRole('region', { name: 'Kühlzelle' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Trockenlager' })).toBeTruthy();
    expect(screen.getByText('0 von 10 gezählt, Differenz CHF 0.00')).toBeTruthy();
    expect(screen.getByText('erwartet 60 Stk. · mindestens haltbar bis 28.11.2026')).toBeTruthy();

    await user.type(eggs, '54');
    expect(await screen.findByText('Differenz -6 Stk., CHF -2.70')).toBeTruthy();
    // «stimmt» fills in what was expected.
    await user.click(screen.getByRole('button', { name: /^stimmt, Butter/ }));
    expect((await counted(/^Gezählt, Butter/)).value).toBe('2');
    expect(await screen.findByText('Keine Differenz')).toBeTruthy();
    expect(screen.getByText('2 von 10 gezählt, Differenz CHF -2.70')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Inventur abschliessen' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Inventur abschliessen?' });
    expect(
      within(dialog).getByText(
        '2 Chargen gezählt. 8 Chargen nicht gezählt, sie bleiben unverändert.',
      ),
    ).toBeTruthy();
    expect(within(dialog).getByText('Eier: -6 Stk., CHF -2.70')).toBeTruthy();
    expect(within(dialog).queryByText(/Butter/)).toBeNull();
    expect(within(dialog).getByText('Differenz gesamt CHF -2.70')).toBeTruthy();
    await user.click(within(dialog).getByRole('button', { name: 'Abschliessen' }));

    expect(await screen.findByText('Inventur abgeschlossen, Differenz CHF -2.70')).toBeTruthy();
    // The fields are empty again and the list shows the new stock.
    expect((await counted(/^Gezählt, Eier/)).value).toBe('');
    expect(
      await screen.findByText('erwartet 54 Stk. · mindestens haltbar bis 28.11.2026'),
    ).toBeTruthy();
    expect((await t.storage.lots.get(kitchen.lots.eggs.id))?.quantity).toBe(54);
    const journal = await t.useCases['stock.journal']({
      businessId: t.businessId,
      type: 'adjustment',
    });
    expect(journal.movements).toEqual([
      expect.objectContaining({
        articleName: 'Eier',
        unit: 'pcs',
        quantity: -6,
        valueRappen: -270,
      }),
    ]);
    const [record] = await t.storage.counts.ofBusiness(t.businessId);
    expect(record?.lines).toHaveLength(2);
    expect(record).toMatchObject({ valueDeltaRappen: -270, countedOn: '2026-11-14' });
    expect(record).not.toHaveProperty('areaId');
  });

  it('counts one area alone and takes in what stands on no lot', async () => {
    const { user, t, kitchen, router } = await renderApp(<CountPage />, {
      route: '/stock/count',
    });
    await counted(/^Gezählt, Eier/);
    await user.click(await screen.findByRole('radio', { name: 'Trockenlager' }));
    await waitFor(() => {
      expect(screen.queryByRole('region', { name: 'Kühlzelle' })).toBeNull();
    });
    expect(router.state.location.search).toBe(`?area=${kitchen.areas.dry.id}`);
    expect(screen.getByText('0 von 4 gezählt, Differenz CHF 0.00')).toBeTruthy();
    const flour = await counted(/^Gezählt, Weissmehl/);
    await user.type(flour, '3.5');
    // 500 g more than expected: 0.5 kg × 1.60 = 0.80
    expect(await screen.findByText('Differenz 500 g, CHF 0.80')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Gefundenes erfassen' }));
    const sheet = await screen.findByRole('dialog', { name: 'Gefundenes erfassen' });
    await user.type(within(sheet).getByLabelText('Artikel'), 'zwieb');
    await user.click(await within(sheet).findByRole('option', { name: /Zwiebeln/ }));
    // The area being counted is prefilled.
    await within(sheet).findByRole('option', { name: 'Trockenlager' });
    expect(within(sheet).getByLabelText<HTMLSelectElement>('Lagerbereich').value).toBe(
      kitchen.areas.dry.id,
    );
    await user.type(await within(sheet).findByLabelText('Menge'), '2');
    await user.click(within(sheet).getByRole('button', { name: 'Hinzufügen' }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Gefundenes erfassen' })).toBeNull();
    });
    const found = screen.getByRole('list', { name: 'Gefundene Ware' });
    expect(within(found).getByText('Zwiebeln')).toBeTruthy();
    expect(within(found).getByText('2 kg · Trockenlager')).toBeTruthy();
    // 0.80 + 2 kg × 2.20 = 5.20
    expect(screen.getByText('1 von 4 gezählt, 1 gefunden, Differenz CHF 5.20')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Inventur abschliessen' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Inventur abschliessen?' });
    expect(within(dialog).getByText('Weissmehl: 500 g, CHF 0.80')).toBeTruthy();
    expect(within(dialog).getByText('Zwiebeln, gefunden: 2 kg, CHF 4.40')).toBeTruthy();
    await user.click(within(dialog).getByRole('button', { name: 'Abschliessen' }));
    expect(await screen.findByText('Inventur abgeschlossen, Differenz CHF 5.20')).toBeTruthy();

    const [record] = await t.storage.counts.ofBusiness(t.businessId);
    expect(record).toMatchObject({ areaId: kitchen.areas.dry.id, valueDeltaRappen: 520 });
    expect((await t.storage.lots.get(kitchen.lots.flour.id))?.quantity).toBe(3500);
    const lots = await t.storage.lots.ofBusiness(t.businessId);
    expect(lots.find((lot) => lot.origin === 'count')).toMatchObject({
      articleId: kitchen.articles.onions.id,
      areaId: kitchen.areas.dry.id,
      quantity: 2000,
      pricePer1000: 220,
    });
  });

  it('asks before finishing, can be called off, and does not finish with nothing counted', async () => {
    const { user, t } = await renderApp(<CountPage />, { route: '/stock/count' });
    const eggs = await counted(/^Gezählt, Eier/);
    await user.click(screen.getByRole('button', { name: 'Inventur abschliessen' }));
    expect(
      await screen.findByText('Zähle mindestens eine Charge oder erfasse Gefundenes.'),
    ).toBeTruthy();
    expect(screen.queryByRole('alertdialog')).toBeNull();

    // Text the field cannot read is said, not dropped: the stock take does not finish.
    await user.type(eggs, 'viele');
    await user.click(screen.getByRole('button', { name: 'Inventur abschliessen' }));
    expect(
      await screen.findByText(
        'Diese Menge lässt sich nicht lesen. Trag eine Zahl ein, zum Beispiel 12.',
      ),
    ).toBeTruthy();
    expect(screen.queryByRole('alertdialog')).toBeNull();

    await user.clear(eggs);
    await user.type(eggs, '60');
    await user.click(screen.getByRole('button', { name: 'Inventur abschliessen' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Inventur abschliessen?' });
    expect(
      within(dialog).getByText(
        'Alles stimmt mit dem Bestand überein. Die Inventur wird ohne Korrektur festgehalten.',
      ),
    ).toBeTruthy();
    await user.click(within(dialog).getByRole('button', { name: 'Abbrechen' }));
    await waitFor(() => {
      expect(screen.queryByRole('alertdialog')).toBeNull();
    });
    expect(await t.storage.counts.ofBusiness(t.businessId)).toEqual([]);
    // What was typed is still there.
    expect((await counted(/^Gezählt, Eier/)).value).toBe('60');
  });

  it('moves with Enter from one lot to the next, and tells the keyboard so', async () => {
    const { user } = await renderApp(<CountPage />, { route: '/stock/count' });
    const butter = await counted(/^Gezählt, Butter/);
    const eggs = await counted(/^Gezählt, Eier/);
    await user.type(butter, '2{Enter}');
    await waitFor(() => {
      expect(document.activeElement).toBe(eggs);
    });
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(butter.getAttribute('enterkeyhint')).toBe('next');
  });

  it('prints the empty count sheet with what is expected and room to write', async () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => undefined);
    const { user } = await renderApp(<CountPage />, { route: '/stock/count' });
    await counted(/^Gezählt, Eier/);
    await user.click(screen.getByRole('button', { name: 'Zählblatt drucken' }));
    expect(print).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Zählblatt')).toBeTruthy();
    expect(screen.getByText('Testküche · 14.11.2026')).toBeTruthy();
    const cold = screen.getByRole('table', { name: 'Kühlzelle' });
    expect(within(cold).getAllByRole('row')).toHaveLength(7);
    const eggs = within(cold).getByRole('row', { name: /Eier/ });
    expect(within(eggs).getByText('28.11.2026')).toBeTruthy();
    expect(within(eggs).getByText('60 Stk.')).toBeTruthy();
    expect(
      within(screen.getByRole('table', { name: 'Trockenlager' })).getByText('Regal 1, oben'),
    ).toBeTruthy();
  });

  it('says so when an area holds nothing', async () => {
    const { user } = await renderApp(<CountPage />, { route: '/stock/count' });
    await counted(/^Gezählt, Eier/);
    await user.click(await screen.findByRole('radio', { name: 'Tiefkühlzelle' }));
    expect(await screen.findByText('Nichts zu zählen')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Gefundenes erfassen' })).toBeTruthy();
  });
});
