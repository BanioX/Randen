import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderApp } from '../../app/test-helpers';
import { BudgetPage } from './BudgetPage';

/** The test kitchen on Saturday, 14.11.2026, bought CHF 537.00 on 13.11. (see `seedKitchen`). */
describe('Budget of the month', () => {
  it('saves the budget of the month and shows how it stands', async () => {
    const view = await renderApp(<BudgetPage />, { route: '/numbers/budget' });
    await view.user.type(await screen.findByLabelText('Einkaufsbudget'), '22000');
    await view.user.click(screen.getByRole('button', { name: 'Budget sichern' }));
    // The row is stored for November, and the page shows the budget against the purchases.
    await waitFor(async () => {
      const rows = (await view.t.storage.budgets.ofBusiness(view.t.businessId)).filter(
        (row) => row.month === '2026-11',
      );
      expect(rows.map((row) => row.purchaseBudgetRappen)).toEqual([2_200_000]);
    });
    expect(await screen.findByText(/von CHF 22’000.00/)).toBeTruthy();
    // 537.00 of 22’000.00 is spent, so the month is well on track.
    expect(screen.getByText('Im Rahmen')).toBeTruthy();
  });

  it('shows the purchases by supplier', async () => {
    await renderApp(<BudgetPage />, { route: '/numbers/budget' });
    const table = await screen.findByRole('table', { name: 'Einkauf nach Lieferant' });
    expect(within(table).getByText('Grosshandel Beispiel')).toBeTruthy();
    expect(within(table).getByText('Metzgerei Muster')).toBeTruthy();
  });

  it('switches the month with the arrows, and keeps it in the address', async () => {
    const view = await renderApp(<BudgetPage />, { route: '/numbers/budget' });
    await view.user.click(await screen.findByRole('button', { name: 'Vormonat' }));
    expect(view.router.state.location.search).toBe('?month=2026-10');
    expect((await screen.findAllByText('Oktober 2026')).length).toBeGreaterThan(0);
  });

  it('lists the six months up to the month shown', async () => {
    await renderApp(<BudgetPage />, { route: '/numbers/budget' });
    const table = await screen.findByRole('table', {
      name: 'Budget, Einkauf und Wareneinsatz der letzten sechs Monate',
    });
    // Header and six months.
    expect(within(table).getAllByRole('row')).toHaveLength(7);
    expect(within(table).getByText('November 2026')).toBeTruthy();
  });

  it('does not save without a budget: the field says what is missing', async () => {
    const view = await renderApp(<BudgetPage />, { route: '/numbers/budget' });
    await screen.findByLabelText('Einkaufsbudget');
    await view.user.click(screen.getByRole('button', { name: 'Budget sichern' }));
    await waitFor(async () => {
      const rows = await view.t.storage.budgets.ofBusiness(view.t.businessId);
      expect(rows).toHaveLength(0);
    });
  });
});
