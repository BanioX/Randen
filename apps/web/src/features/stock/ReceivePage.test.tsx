import { addDays, PurchaseOrderSchema, type Id } from '@randen/core';
import { screen, waitFor, within } from '@testing-library/react';
import type { UserEvent } from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { renderApp, type AppView } from '../../app/test-helpers';
import { ReceivePage } from './ReceivePage';

const adder = () => screen.findByLabelText('Zeile hinzufügen');

/** Takes an article from the list under «Zeile hinzufügen»; its line appears above. */
async function addLine(user: UserEvent, typed: string, name: RegExp) {
  await user.type(await adder(), typed);
  await user.click(await screen.findByRole('option', { name }));
}

const line = (name: string | RegExp) => screen.findByRole('group', { name });

async function addOrder(view: AppView, status: 'sent' | 'received' = 'sent'): Promise<Id> {
  const { t, kitchen } = view;
  const id = t.cmd();
  await t.storage.orders.add(
    PurchaseOrderSchema.parse({
      id,
      businessId: t.businessId,
      createdAt: t.clock.now(),
      updatedAt: t.clock.now(),
      supplierId: kitchen.suppliers.butcher.id,
      status,
      lines: [
        { articleId: kitchen.articles.entrecote.id, quantity: 10_000, pricePer1000: 6400 },
        { articleId: kitchen.articles.salmon.id, quantity: 2000, pricePer1000: 3800 },
      ],
    }),
  );
  return id;
}

describe('ReceivePage', () => {
  it('books 10 kg Entrecôte for CHF 640.00 at CHF 64.00 / kg and says the last price was CHF 62.00', async () => {
    const { user, t, kitchen } = await renderApp(<ReceivePage />, { route: '/stock/receive' });
    expect(await screen.findByRole('heading', { level: 1, name: 'Wareneingang' })).toBeTruthy();
    // The day is today; nothing is on the list yet.
    expect((await screen.findByLabelText<HTMLInputElement>('Geliefert am')).value).toBe(
      '14.11.2026',
    );
    expect(screen.getByText('Noch keine Position. Wähle unten den ersten Artikel.')).toBeTruthy();

    await addLine(user, 'entre', /Rindsentrecôte/);
    const entrecote = await line('Position 1: Rindsentrecôte');
    // The focus is in the quantity of the new line; the usual is prefilled as a proposal.
    const quantity = within(entrecote).getByLabelText<HTMLInputElement>('Menge');
    await waitFor(() => {
      expect(document.activeElement).toBe(quantity);
    });
    expect(within(entrecote).getByLabelText<HTMLInputElement>('Preis pro kg').value).toBe('62.00');
    expect(within(entrecote).getByLabelText<HTMLInputElement>('Zu verbrauchen bis').value).toBe(
      '19.11.2026',
    );
    expect(within(entrecote).getByText('Vorschlag: Lieferung + 5 Tage')).toBeTruthy();
    await within(entrecote).findByRole('option', { name: 'Kühlzelle' });
    expect(within(entrecote).getByLabelText<HTMLSelectElement>('Lagerbereich').value).toBe(
      kitchen.areas.cold.id,
    );

    await user.type(quantity, '10');
    expect(within(entrecote).getByText('Wert CHF 620.00')).toBeTruthy();
    // The delivery note states the amount of the line, not the price per kilogram.
    await user.click(within(entrecote).getByRole('radio', { name: 'als Betrag' }));
    const total = within(entrecote).getByLabelText<HTMLInputElement>('Betrag der Zeile');
    expect(total.value).toBe('620.00');
    await user.clear(total);
    await user.type(total, '640');
    expect(
      await within(entrecote).findByText(
        '= CHF 64.00 / kg · Letzter Preis CHF 62.00 / kg (+3.2 %)',
      ),
    ).toBeTruthy();
    expect(within(entrecote).getByText('Wert CHF 640.00')).toBeTruthy();
    // What will happen stands above the button.
    expect(screen.getByText('1 Charge, CHF 640.00')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Wareneingang buchen' }));
    expect(
      await screen.findByText(
        'Gebucht: 1 Charge, CHF 640.00. Das Formular ist bereit für die nächste Lieferung.',
      ),
    ).toBeTruthy();
    // The form is empty again.
    expect(screen.queryByRole('group', { name: 'Position 1: Rindsentrecôte' })).toBeNull();
    expect(screen.getByText('Noch keine Position. Wähle unten den ersten Artikel.')).toBeTruthy();

    const lots = (await t.storage.lots.ofBusiness(t.businessId)).filter(
      (lot) =>
        lot.articleId === kitchen.articles.entrecote.id && lot.id !== kitchen.lots.entrecote.id,
    );
    expect(lots).toHaveLength(1);
    expect(lots[0]).toMatchObject({
      quantity: 10_000,
      pricePer1000: 6400,
      expiresOn: '2026-11-19',
      areaId: kitchen.areas.cold.id,
      origin: 'purchase',
    });
    expect((await t.storage.articles.get(kitchen.articles.entrecote.id))?.pricePer1000).toBe(6400);
    const deliveries = await t.storage.deliveries.ofBusiness(t.businessId);
    expect(deliveries).toHaveLength(1);
    expect(deliveries[0]).toMatchObject({ totalRappen: 64_000, checkOk: true });
  });

  it('adds a line only when an article is taken, and Enter leads to the next line', async () => {
    const { user } = await renderApp(<ReceivePage />, { route: '/stock/receive' });
    const field = await adder();
    // «Butter» typed in full is not taken while the person may still be typing.
    await user.type(field, 'Butter');
    expect(await screen.findByRole('option', { name: /Butter/ })).toBeTruthy();
    expect(screen.queryByRole('group', { name: /Position 1/ })).toBeNull();
    await user.keyboard('{Enter}');
    const butter = await line('Position 1: Butter');
    const quantity = within(butter).getByLabelText('Menge');
    await waitFor(() => {
      expect(document.activeElement).toBe(quantity);
    });
    // The field under «Zeile hinzufügen» is empty and ready again.
    expect((await adder()).getAttribute('value')).toBe('');

    // Enter in a field of the line does not book: it leads to the article of the next line.
    await user.type(quantity, '2{Enter}');
    await waitFor(async () => {
      expect(document.activeElement).toBe(await adder());
    });
    expect(screen.queryByText(/Gebucht/)).toBeNull();
    expect(screen.getByText('1 Charge, CHF 28.00')).toBeTruthy();
    // The keyboard of a phone says what Enter does.
    expect(quantity.getAttribute('enterkeyhint')).toBe('next');

    // Leaving the field with a name typed in full takes the article as well.
    await user.type(await adder(), 'eier');
    await user.tab();
    expect(await line('Position 2: Eier')).toBeTruthy();
    expect(screen.getByText('2 Chargen, CHF 28.00')).toBeTruthy();

    // A line can be taken off again.
    await user.click(screen.getByRole('button', { name: 'Entfernen, Eier' }));
    await waitFor(() => {
      expect(screen.queryByRole('group', { name: 'Position 2: Eier' })).toBeNull();
    });
    expect(screen.getByText('1 Charge, CHF 28.00')).toBeTruthy();
  });

  it('says calmly when a price lies more than 10 % off the last one', async () => {
    const { user } = await renderApp(<ReceivePage />, { route: '/stock/receive' });
    await addLine(user, 'eier', /Eier/);
    const eggs = await line('Position 1: Eier');
    const price = within(eggs).getByLabelText<HTMLInputElement>('Preis pro Stk.');
    expect(price.value).toBe('0.45');
    await user.type(within(eggs).getByLabelText('Menge'), '90');
    await user.clear(price);
    await user.type(price, '0.60');
    // 0.60 against 0.45 is a third more.
    expect(
      await within(eggs).findByText('Der Preis liegt 33.3 % über dem letzten (CHF 0.45 / Stk.).'),
    ).toBeTruthy();
    expect(within(eggs).getByText('Wert CHF 54.00')).toBeTruthy();
    await user.clear(price);
    await user.type(price, '0.36');
    expect(
      await within(eggs).findByText('Der Preis liegt 20 % unter dem letzten (CHF 0.45 / Stk.).'),
    ).toBeTruthy();
    // Within ten percent it is a quiet line under the field.
    await user.clear(price);
    await user.type(price, '0.47');
    expect(await within(eggs).findByText('Letzter Preis CHF 0.45 / Stk. (+4.4 %)')).toBeTruthy();
    expect(within(eggs).queryByText(/Der Preis liegt/)).toBeNull();
    // Without a price the last one applies, and the page says so.
    await user.clear(price);
    expect(
      await within(eggs).findByText('Ohne Angabe gilt der letzte Preis: CHF 0.45 / Stk.'),
    ).toBeTruthy();
    expect(within(eggs).getByText('Wert CHF 40.50')).toBeTruthy();
  });

  it('books several lines with supplier, delivery note, lot number and the check at the door', async () => {
    const { user, t, kitchen } = await renderApp(<ReceivePage />, { route: '/stock/receive' });
    await screen.findByRole('option', { name: 'Grosshandel Beispiel' });
    await user.selectOptions(screen.getByLabelText('Lieferant'), 'Grosshandel Beispiel');
    await user.type(screen.getByLabelText('Lieferschein-Nr.'), 'LS-1042');

    await addLine(user, 'rahm', /Vollrahm/);
    const cream = await line('Position 1: Vollrahm');
    await user.type(within(cream).getByLabelText('Menge'), '5');
    // The date on the pack wins over the proposal.
    const date = within(cream).getByLabelText('Mindestens haltbar bis');
    await user.clear(date);
    await user.type(date, '30.11.2026');
    expect(within(cream).queryByText(/Vorschlag/)).toBeNull();
    await user.click(within(cream).getByRole('button', { name: 'Chargen-Nr. erfassen, Vollrahm' }));
    await user.type(await within(cream).findByLabelText('Chargen-Nr.'), 'L-77');

    await addLine(user, 'mehl', /Weissmehl/);
    const flour = await line('Position 2: Weissmehl');
    await user.type(within(flour).getByLabelText('Menge'), '10');
    // Dry goods get the Richtwert of their group: a year.
    expect(within(flour).getByText('Vorschlag: Lieferung + 365 Tage')).toBeTruthy();
    const flourDate = within(flour).getByLabelText('Mindestens haltbar bis');
    await user.clear(flourDate);

    await user.type(screen.getByLabelText('Temperatur'), '3.5');
    await user.type(screen.getByLabelText('Bemerkung'), 'Kartons trocken.');
    // 5 l × 6.40 + 10 kg × 1.60 = 48.00
    expect(screen.getByText('2 Chargen, CHF 48.00')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Wareneingang buchen' }));
    expect(await screen.findByText(/Gebucht: 2 Chargen, CHF 48\.00/)).toBeTruthy();

    const [delivery] = await t.storage.deliveries.ofBusiness(t.businessId);
    expect(delivery).toMatchObject({
      supplierId: kitchen.suppliers.wholesaler.id,
      documentNumber: 'LS-1042',
      receivedOn: '2026-11-14',
      tempDeciC: 35,
      checkOk: true,
      note: 'Kartons trocken.',
      totalRappen: 4800,
    });
    expect(delivery?.lines).toEqual([
      expect.objectContaining({
        articleId: kitchen.articles.cream.id,
        quantity: 5000,
        pricePer1000: 640,
        expiresOn: '2026-11-30',
        lotCode: 'L-77',
      }),
      expect.objectContaining({ articleId: kitchen.articles.flour.id, quantity: 10_000 }),
    ]);
    expect(delivery?.lines[1]).not.toHaveProperty('expiresOn');
    const logs = await t.storage.temperatureLogs.ofBusiness(t.businessId);
    expect(logs).toEqual([
      expect.objectContaining({
        kind: 'receiving',
        label: 'Grosshandel Beispiel',
        deciC: 35,
        ok: true,
      }),
    ]);
  });

  it('follows the day of the delivery with the proposed dates, and records a refused check', async () => {
    const { user, t } = await renderApp(<ReceivePage />, { route: '/stock/receive' });
    await addLine(user, 'lachs', /Lachsfilet/);
    const salmon = await line('Position 1: Lachsfilet');
    const date = within(salmon).getByLabelText<HTMLInputElement>('Zu verbrauchen bis');
    expect(date.value).toBe('17.11.2026');
    const day = screen.getByLabelText('Geliefert am');
    await user.clear(day);
    await user.type(day, '13.11.2026');
    await waitFor(() => {
      expect(date.value).toBe('16.11.2026');
    });
    await user.type(within(salmon).getByLabelText('Menge'), '2');
    await user.click(screen.getByRole('switch', { name: 'Ware in Ordnung' }));
    expect(
      screen.getByText('Halte in der Bemerkung fest, was nicht stimmt und was du getan hast.'),
    ).toBeTruthy();
    await user.type(screen.getByLabelText('Temperatur'), '7.5');
    await user.type(screen.getByLabelText('Bemerkung'), 'Zu warm, Lieferant informiert.');
    await user.click(screen.getByRole('button', { name: 'Wareneingang buchen' }));
    expect(await screen.findByText(/Gebucht: 1 Charge, CHF 76\.00/)).toBeTruthy();
    const [delivery] = await t.storage.deliveries.ofBusiness(t.businessId);
    expect(delivery).toMatchObject({ receivedOn: '2026-11-13', checkOk: false });
    expect(delivery?.lines[0]).toMatchObject({ expiresOn: '2026-11-16' });
    expect(await t.storage.temperatureLogs.ofBusiness(t.businessId)).toEqual([
      expect.objectContaining({
        label: 'Wareneingang',
        deciC: 75,
        ok: false,
        action: 'Zu warm, Lieferant informiert.',
      }),
    ]);
  });

  it('does not book without a line or without a quantity', async () => {
    const { user, t } = await renderApp(<ReceivePage />, { route: '/stock/receive' });
    await adder();
    await user.click(screen.getByRole('button', { name: 'Wareneingang buchen' }));
    expect(await screen.findByText('Füge mindestens einen Artikel hinzu.')).toBeTruthy();
    await addLine(user, 'butter', /Butter/);
    const butter = await line('Position 1: Butter');
    await waitFor(() => {
      expect(screen.queryByText('Füge mindestens einen Artikel hinzu.')).toBeNull();
    });
    await user.click(screen.getByRole('button', { name: 'Wareneingang buchen' }));
    expect(await within(butter).findByText('Hier fehlt eine Angabe.')).toBeTruthy();
    expect(await t.storage.deliveries.ofBusiness(t.businessId)).toEqual([]);
  });

  it('takes the lines of an order, books them and marks the order as received', async () => {
    const view = await renderApp(<ReceivePage />, { route: '/stock/receive' });
    const { user, t, kitchen, router } = view;
    const orderId = await addOrder(view);
    await router.navigate(`/stock/receive?order=${orderId}`);
    expect(await screen.findByText('Bestellung bei Metzgerei Muster')).toBeTruthy();
    const entrecote = await line('Position 1: Rindsentrecôte');
    const salmon = await line('Position 2: Lachsfilet');
    expect(within(entrecote).getByLabelText<HTMLInputElement>('Menge').value).toBe('10');
    // The price of the order, against the last price of the article.
    expect(within(entrecote).getByLabelText<HTMLInputElement>('Preis pro kg').value).toBe('64.00');
    expect(within(entrecote).getByText('Letzter Preis CHF 62.00 / kg (+3.2 %)')).toBeTruthy();
    expect(within(salmon).getByLabelText<HTMLInputElement>('Menge').value).toBe('2');
    await screen.findByRole('option', { name: 'Metzgerei Muster' });
    expect(screen.getByLabelText<HTMLSelectElement>('Lieferant').value).toBe(
      kitchen.suppliers.butcher.id,
    );
    // 10 kg × 64.00 + 2 kg × 38.00 = 716.00
    expect(screen.getByText('2 Chargen, CHF 716.00')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Wareneingang buchen' }));
    expect(await screen.findByText(/Gebucht: 2 Chargen, CHF 716\.00/)).toBeTruthy();
    // The next delivery starts without the order.
    expect(router.state.location.search).toBe('');
    expect(screen.queryByText('Bestellung bei Metzgerei Muster')).toBeNull();
    const order = await t.storage.orders.get(orderId);
    expect(order?.status).toBe('received');
    const [delivery] = await t.storage.deliveries.ofBusiness(t.businessId);
    expect(delivery).toMatchObject({ orderId, supplierId: kitchen.suppliers.butcher.id });
    expect(order?.deliveryId).toBe(delivery?.id);
  });

  it('says so when the order was received before, or does not exist', async () => {
    const view = await renderApp(<ReceivePage />, { route: '/stock/receive' });
    const orderId = await addOrder(view, 'received');
    await view.router.navigate(`/stock/receive?order=${orderId}`);
    expect(
      await screen.findByText(
        'Diese Bestellung ist schon als geliefert gebucht. Eine weitere Lieferung wird dazugebucht.',
      ),
    ).toBeTruthy();
    await view.router.navigate(`/stock/receive?order=${view.t.cmd()}`);
    expect(await screen.findByText('Diese Bestellung gibt es nicht mehr.')).toBeTruthy();
    await view.router.navigate('/stock/receive?order=keine-kennung');
    expect(await screen.findByRole('heading', { level: 1, name: 'Nicht gefunden' })).toBeTruthy();
  });

  it('books the opening stock without supplier and check, and not as a purchase', async () => {
    const { user, t, kitchen } = await renderApp(<ReceivePage />, {
      route: '/stock/receive?mode=opening',
    });
    expect(await screen.findByRole('heading', { level: 1, name: 'Anfangsbestand' })).toBeTruthy();
    expect((await screen.findByLabelText<HTMLInputElement>('Stand vom')).value).toBe('14.11.2026');
    expect(screen.queryByLabelText('Lieferant')).toBeNull();
    expect(screen.queryByLabelText('Temperatur')).toBeNull();
    await addLine(user, 'jus', /Rotweinjus/);
    const jus = await line('Position 1: Rotweinjus');
    // The jus has no price yet: the page says what that means.
    expect(
      within(jus).getByText('Ohne Preis steht diese Charge mit CHF 0.00 im Lagerwert.'),
    ).toBeTruthy();
    await user.type(within(jus).getByLabelText('Menge'), '2');
    await user.type(within(jus).getByLabelText('Preis pro l'), '8');
    expect(
      await within(jus).findByText(
        'Der erste Preis für diesen Artikel. Er wird als letzter Preis gemerkt.',
      ),
    ).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Anfangsbestand buchen' }));
    expect(await screen.findByText(/Gebucht: 1 Charge, CHF 16\.00/)).toBeTruthy();
    const lots = (await t.storage.lots.ofBusiness(t.businessId)).filter(
      (lot) => lot.articleId === kitchen.articles.jus.id,
    );
    expect(lots).toEqual([
      expect.objectContaining({
        origin: 'opening',
        quantity: 2000,
        pricePer1000: 800,
        expiresOn: addDays(t.clock.today(), 3),
      }),
    ]);
    expect(await t.storage.deliveries.ofBusiness(t.businessId)).toEqual([]);
    expect((await t.storage.articles.get(kitchen.articles.jus.id))?.pricePer1000).toBe(800);
  });
});
