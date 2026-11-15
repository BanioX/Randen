import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderApp } from '../../app/test-helpers';
import { MonthReportPage } from './MonthReportPage';

describe('Monatsbericht', () => {
  it('shows the business and the month, with the sections of the report', async () => {
    await renderApp(<MonthReportPage />, { route: '/numbers/report' });
    expect(await screen.findByText('Testküche')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Monatsbericht November 2026' })).toBeTruthy();
    for (const name of [
      'Wareneinsatz und Umsatz',
      'Einkauf gegen Budget',
      'Abschreiber',
      'Break-even',
      'Lagerwert',
    ]) {
      expect(screen.getByRole('heading', { name })).toBeTruthy();
    }
    // The receipts of 13.11. are the purchases of the month.
    expect(screen.getAllByText('CHF 537.00').length).toBeGreaterThan(0);
  });

  it('prints with the browser, from the button', async () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => undefined);
    const view = await renderApp(<MonthReportPage />, { route: '/numbers/report' });
    await view.user.click(await screen.findByRole('button', { name: 'Drucken' }));
    expect(print).toHaveBeenCalledTimes(1);
    print.mockRestore();
  });

  it('switches the month, and keeps it in the address', async () => {
    const view = await renderApp(<MonthReportPage />, { route: '/numbers/report' });
    await view.user.click(await screen.findByRole('button', { name: 'Vormonat' }));
    expect(view.router.state.location.search).toBe('?month=2026-10');
    expect(await screen.findByRole('heading', { name: 'Monatsbericht Oktober 2026' })).toBeTruthy();
  });
});
