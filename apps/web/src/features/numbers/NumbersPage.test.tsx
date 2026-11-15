import { writeDetailed } from '../../app/view';
import { screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { renderApp } from '../../app/test-helpers';
import { NumbersPage } from './NumbersPage';

afterEach(() => {
  window.localStorage.clear();
});

/**
 * The test kitchen on Saturday, 14.11.2026: CHF 537.00 bought on 13.11., no sales yet. The page
 * with everything shown (no localStorage: «Erweitert» is the default).
 */
describe('Zahlen, the overview', () => {
  it('shows the month of the test kitchen: purchases, stock and the cost of goods still to come', async () => {
    const view = await renderApp(<NumbersPage />, { route: '/numbers' });
    expect(await screen.findByText('Einkauf')).toBeTruthy();
    // The stock of the kitchen is CHF 537.00, as is the purchase of the month.
    expect(screen.getAllByText('537.00').length).toBeGreaterThan(0);
    // No sales: the dark card says so in words instead of a figure.
    expect(screen.getByText('Ohne Umsatz noch kein Wareneinsatz in Prozent.')).toBeTruthy();
    // Days without sales are said, never hidden (ADR-0008).
    expect(screen.getByText(/Tage ohne Verkaufseintrag/)).toBeTruthy();
    expect(view.router.state.location.search).toBe('');
  });

  it('keeps the period in the address: 7 days', async () => {
    const view = await renderApp(<NumbersPage />, { route: '/numbers' });
    const period = await screen.findByRole('radiogroup', { name: 'Zeitraum' });
    await view.user.click(within(period).getByRole('radio', { name: '7 Tage' }));
    expect(view.router.state.location.search).toBe('?period=7');
    expect(within(period).getByRole('radio', { name: '7 Tage' }).getAttribute('aria-checked')).toBe(
      'true',
    );
  });

  it('shows the doors of the detailed view: break-even and the month report', async () => {
    await renderApp(<NumbersPage />, { route: '/numbers' });
    expect(await screen.findByRole('link', { name: /Break-even/ })).toBeTruthy();
    expect(screen.getByRole('link', { name: /Monatsbericht/ })).toBeTruthy();
  });

  it('shows the month in a few figures on the essentials view, without the detailed evaluations', async () => {
    writeDetailed(false);
    await renderApp(<NumbersPage />, { route: '/numbers' });
    expect(await screen.findByText('Budget übrig')).toBeTruthy();
    expect(screen.queryByRole('radiogroup', { name: 'Zeitraum' })).toBeNull();
    expect(screen.queryByRole('img', { name: /Umsatz netto und Wareneinsatz/ })).toBeNull();
    expect(screen.queryByRole('link', { name: /Break-even/ })).toBeNull();
  });
});
