import { localDate, SaleSchema } from '@randen/core';
import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { createStockLedger } from '@randen/core';
import { renderApp, type AppView } from '../../app/test-helpers';
import { writeDetailed } from '../../app/view';
import { BreakEvenPage } from './BreakEvenPage';

/** A sale of CHF 43’240.00 gross today: CHF 40’000.00 net at 8.1 % VAT. */
async function sellToday(view: AppView) {
  const now = view.t.clock.now();
  await view.t.storage.sales.add(
    SaleSchema.parse({
      id: view.t.ids.next(),
      businessId: view.t.businessId,
      createdAt: now,
      updatedAt: now,
      soldOn: localDate('2026-11-14'),
      portions: 1,
      grossRappen: 4_324_000,
      vatBps: 810,
      bookedStock: false,
      label: 'Umsatz',
    }),
  );
}

/** Goods of CHF 12’000.00 used today: a flour lot of 1000 kg at CHF 12.00/kg, all taken out. */
async function useGoodsToday(view: AppView) {
  const ledger = createStockLedger(view.t.ctx);
  await view.t.storage.transaction(async () => {
    const lot = await ledger.receive({
      businessId: view.t.businessId,
      articleId: view.kitchen.articles.flour.id,
      areaId: view.kitchen.areas.dry.id,
      quantity: 1_000_000,
      pricePer1000: 1200,
      receivedOn: localDate('2026-11-14'),
      origin: 'purchase',
      updateArticlePrice: false,
    });
    await ledger.consumeLot({
      businessId: view.t.businessId,
      lotId: lot.id,
      quantity: 1_000_000,
      on: localDate('2026-11-14'),
      purpose: 'production',
    });
  });
}

describe('Break-even of the month', () => {
  it('asks for the fixed costs when they are not known yet', async () => {
    await renderApp(<BreakEvenPage />, { route: '/numbers/break-even' });
    expect(await screen.findByText('Noch keine Fixkosten')).toBeTruthy();
  });

  it('acceptance: fixed costs CHF 35’000.00 and net revenue CHF 40’000.00 at CHF 12’000.00 goods: CHF 10’000.00 short', async () => {
    const view = await renderApp(<BreakEvenPage />, { route: '/numbers/break-even' });
    await view.user.type(await screen.findByLabelText('Fixkosten'), '35000');
    await view.user.type(screen.getByLabelText('Einkaufsbudget'), '20000');
    await view.user.click(screen.getByRole('button', { name: 'Fixkosten sichern' }));
    await waitFor(async () => {
      const rows = await view.t.storage.budgets.ofBusiness(view.t.businessId);
      expect(rows.map((row) => row.fixedCostsRappen)).toEqual([3_500_000]);
    });
    await sellToday(view);
    await useGoodsToday(view);
    // The page is re-read on every change of the data it shows: the answer comes with it.
    expect(
      await screen.findByText(
        'Ab CHF 50’000 Umsatz im Monat verdient die Küche Geld. Es fehlen noch CHF 10’000.',
      ),
    ).toBeTruthy();
    expect(screen.getByText('Deckungsbeitrag')).toBeTruthy();
    expect(screen.getByText('70 %')).toBeTruthy();
  });

  it('says the revenue is still missing, while the fixed costs are known', async () => {
    const view = await renderApp(<BreakEvenPage />, { route: '/numbers/break-even' });
    await view.t.useCases['budgets.set']({
      commandId: view.t.cmd(),
      businessId: view.t.businessId,
      month: '2026-11',
      purchaseBudgetRappen: 2_000_000,
      fixedCostsRappen: 3_500_000,
    });
    expect(
      await screen.findByText('Noch kein Umsatz im Monat. Ab dann rechnet Randen den Break-even.'),
    ).toBeTruthy();
  });

  it('shows the figures on the essentials view as well, with the same answer', async () => {
    writeDetailed(false);
    const view = await renderApp(<BreakEvenPage />, { route: '/numbers/break-even' });
    await view.t.useCases['budgets.set']({
      commandId: view.t.cmd(),
      businessId: view.t.businessId,
      month: '2026-11',
      purchaseBudgetRappen: 2_000_000,
      fixedCostsRappen: 3_500_000,
    });
    expect(
      await screen.findByText('Noch kein Umsatz im Monat. Ab dann rechnet Randen den Break-even.'),
    ).toBeTruthy();
  });
});
