import { addDays } from '@randen/core';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderApp, type AppView } from '../../app/test-helpers';
import { WastePage } from './WastePage';

const routes = [{ path: '/stock/expiring', element: <h1>Ablauf</h1> }];

function moveDays(view: AppView, days: number) {
  view.t.clock.setToday(addDays(view.t.clock.today(), days));
  fireEvent(document, new Event('visibilitychange'));
}

async function wasteOf(view: AppView) {
  return (await view.t.storage.movements.ofBusiness(view.t.businessId)).filter(
    (movement) => movement.type === 'waste',
  );
}

describe('WastePage', () => {
  it('writes a part of a lot off: article, lot, quantity, reason, with the value said before', async () => {
    const view = await renderApp(<WastePage />, { route: '/stock/waste' });
    const { user, t, kitchen } = view;
    expect(await screen.findByRole('heading', { level: 1, name: 'Abschreiber' })).toBeTruthy();
    await user.type(await screen.findByLabelText('Artikel'), 'rahm');
    await user.click(await screen.findByRole('option', { name: /Vollrahm/ }));
    // The lot that is due first comes chosen, with its whole rest as the quantity.
    const lot = await screen.findByLabelText<HTMLSelectElement>('Charge');
    expect(lot.value).toBe(kitchen.lots.creamOld.id);
    expect(
      within(lot).getByRole('option', {
        name: 'mindestens haltbar bis 20.11.2026 · 3 l · Kühlzelle',
      }),
    ).toBeTruthy();
    const quantity = screen.getByLabelText<HTMLInputElement>('Menge');
    expect(quantity.value).toBe('3');
    expect(screen.getByText('Ganze Charge: 3 l')).toBeTruthy();
    expect(screen.getByText('3 l Vollrahm, CHF 19.20')).toBeTruthy();

    // The other lot: its rest becomes the quantity.
    await user.selectOptions(lot, kitchen.lots.creamNew.id);
    await waitFor(() => {
      expect(quantity.value).toBe('5');
    });
    await user.clear(quantity);
    await user.type(quantity, '7.5 dl');
    expect(await screen.findByText('750 ml Vollrahm, CHF 4.80')).toBeTruthy();

    // Without a reason nothing is booked.
    await user.click(screen.getByRole('button', { name: 'Abschreiben' }));
    expect(await screen.findByText('Wähle den Grund.')).toBeTruthy();
    expect(await wasteOf(view)).toEqual([]);
    await user.click(screen.getByRole('radio', { name: 'Überproduktion' }));
    await user.type(screen.getByLabelText('Bemerkung'), 'Zu viel aufgeschlagen');
    await user.click(screen.getByRole('button', { name: 'Abschreiben' }));

    expect(await screen.findByText('750 ml Vollrahm abgeschrieben, CHF 4.80')).toBeTruthy();
    // Ready for the next one: nothing is chosen any more.
    expect(screen.getByLabelText<HTMLInputElement>('Artikel').value).toBe('');
    expect(screen.queryByLabelText('Charge')).toBeNull();
    expect(await wasteOf(view)).toEqual([
      expect.objectContaining({
        lotId: kitchen.lots.creamNew.id,
        quantity: -750,
        valueRappen: -480,
        reason: 'overproduction',
        note: 'Zu viel aufgeschlagen',
      }),
    ]);
    expect((await t.storage.lots.get(kitchen.lots.creamNew.id))?.quantity).toBe(4250);
  });

  it('comes with the lot chosen from the list «Ablauf», and leads back there', async () => {
    const view = await renderApp(<WastePage />, { route: '/stock/waste', routes });
    const { user, t, kitchen, router } = view;
    await router.navigate(`/stock/waste?lot=${kitchen.lots.salmon.id}`);
    const lot = await screen.findByLabelText<HTMLSelectElement>('Charge');
    expect(lot.value).toBe(kitchen.lots.salmon.id);
    expect(screen.getByLabelText<HTMLInputElement>('Artikel').value).toBe('Lachsfilet');
    expect(screen.getByLabelText<HTMLInputElement>('Menge').value).toBe('1.5');
    expect(screen.getByText('1.5 kg Lachsfilet, CHF 57.00')).toBeTruthy();
    // More than the lot holds is said at the field, and nothing is booked.
    const quantity = screen.getByLabelText('Menge');
    await user.clear(quantity);
    await user.type(quantity, '2');
    expect(
      await screen.findByText('Die Charge hat 1.5 kg. Trag höchstens so viel ein.'),
    ).toBeTruthy();
    await user.click(screen.getByRole('radio', { name: 'Verdorben' }));
    await user.click(screen.getByRole('button', { name: 'Abschreiben' }));
    expect(await wasteOf(view)).toEqual([]);
    await user.clear(quantity);
    await user.type(quantity, '1.5');
    await user.click(screen.getByRole('button', { name: 'Abschreiben' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Ablauf' })).toBeTruthy();
    expect(router.state.location.pathname).toBe('/stock/expiring');
    expect(await wasteOf(view)).toEqual([
      expect.objectContaining({ quantity: -1500, valueRappen: -5700, reason: 'spoiled' }),
    ]);
    expect((await t.storage.lots.get(kitchen.lots.salmon.id))?.status).toBe('depleted');
  });

  it('knows the reason of a lot past its Verbrauchsdatum and moves its value into the journal', async () => {
    const view = await renderApp(<WastePage />, { route: '/stock/waste', routes });
    const { user, t, kitchen, router } = view;
    moveDays(view, 2);
    await router.navigate(`/stock/waste?lot=${kitchen.lots.salmon.id}`);
    await screen.findByLabelText('Charge');
    await waitFor(() => {
      expect(screen.getByRole<HTMLInputElement>('radio', { name: 'Abgelaufen' }).checked).toBe(
        true,
      );
    });
    await user.click(screen.getByRole('button', { name: 'Abschreiben' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Ablauf' })).toBeTruthy();
    const journal = await t.useCases['stock.journal']({
      businessId: t.businessId,
      type: 'waste',
    });
    expect(journal.movements).toEqual([
      expect.objectContaining({
        articleName: 'Lachsfilet',
        quantity: -1500,
        valueRappen: -5700,
        reason: 'expired',
      }),
    ]);
  });

  it('says so when the lot of the link is used up, and when the link leads nowhere', async () => {
    const view = await renderApp(<WastePage />, { route: '/stock/waste', routes });
    const { t, kitchen, router } = view;
    await t.useCases['stock.writeOff']({
      commandId: t.cmd(),
      businessId: t.businessId,
      lotId: kitchen.lots.creamOld.id,
      quantity: 3000,
      reason: 'other',
    });
    await router.navigate(`/stock/waste?lot=${kitchen.lots.creamOld.id}`);
    expect(
      await screen.findByText('Diese Charge ist nicht mehr an Lager. Wähle eine andere.'),
    ).toBeTruthy();
    // The lot that is left is offered instead.
    expect((await screen.findByLabelText<HTMLSelectElement>('Charge')).value).toBe(
      kitchen.lots.creamNew.id,
    );
    await router.navigate(`/stock/waste?lot=${t.cmd()}`);
    expect(await screen.findByRole('heading', { level: 1, name: 'Nicht gefunden' })).toBeTruthy();
  });

  it('says so while nothing is in stock', async () => {
    const { t, kitchen } = await renderApp(<WastePage />, { route: '/stock/waste' });
    await screen.findByLabelText('Artikel');
    await t.useCases['stock.count']({
      commandId: t.cmd(),
      businessId: t.businessId,
      countedOn: t.clock.today(),
      lines: Object.values(kitchen.lots).map((lot) => ({ lotId: lot.id, counted: 0 })),
    });
    expect(await screen.findByText('Nichts an Lager')).toBeTruthy();
    expect(screen.getByText('Abschreiben lässt sich nur, was an Lager liegt.')).toBeTruthy();
  });
});
