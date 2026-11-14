import { screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderApp } from '../../app/test-helpers';
import { JournalPage } from './JournalPage';

afterEach(() => {
  vi.restoreAllMocks();
});

const journal = () => screen.findByRole('table', { name: 'Lagerbewegungen' });

/** The tile of one type under «Summen je Art». */
function tile(label: string): HTMLElement {
  const sums = screen.getByRole('region', { name: 'Summen je Art' });
  const element = within(sums).getByText(label).closest('div');
  if (element === null) {
    throw new Error(`No tile «${label}»`);
  }
  return element;
}

describe('JournalPage', () => {
  it('answers with the sums per type first, then lists the movements newest first', async () => {
    const { t, kitchen } = await renderApp(<JournalPage />, { route: '/stock/journal' });
    expect(await screen.findByRole('heading', { level: 1, name: 'Journal' })).toBeTruthy();
    const table = await journal();
    // The ten receipts of the day before, in the last seven days.
    expect(screen.getByText('10 Bewegungen vom 08.11.2026 bis 14.11.2026.')).toBeTruthy();
    expect(within(tile('Wareneingang')).getByText('537.00')).toBeTruthy();
    expect(within(tile('Wareneingang')).getByText('10 Buchungen')).toBeTruthy();
    expect(within(tile('Abschreiber')).getByText('0 Buchungen')).toBeTruthy();
    expect(within(table).getAllByRole('row')).toHaveLength(11);

    await t.useCases['stock.writeOff']({
      commandId: t.cmd(),
      businessId: t.businessId,
      lotId: kitchen.lots.salmon.id,
      quantity: 500,
      reason: 'spoiled',
      note: 'Riecht nicht mehr frisch.',
    });
    await t.useCases['stock.withdraw']({
      commandId: t.cmd(),
      businessId: t.businessId,
      articleId: kitchen.articles.butter.id,
      quantity: 250,
      purpose: 'staff',
    });
    expect(await screen.findByText('12 Bewegungen vom 08.11.2026 bis 14.11.2026.')).toBeTruthy();
    expect(within(tile('Abschreiber')).getByText('-19.00')).toBeTruthy();
    expect(within(tile('Abschreiber')).getByText('1 Buchung')).toBeTruthy();
    expect(within(tile('Verbrauch')).getByText('-3.50')).toBeTruthy();
    const rows = within(await journal()).getAllByRole('row');
    // Newest first: the withdrawal, then the write-off, then yesterday's receipts.
    const [, first, second] = rows as [HTMLElement, HTMLElement, HTMLElement];
    expect(within(first).getByText('Butter')).toBeTruthy();
    expect(within(first).getByText('Verbrauch · Personal')).toBeTruthy();
    expect(within(first).getByText('-250 g')).toBeTruthy();
    expect(within(first).getByText('CHF -3.50')).toBeTruthy();
    expect(within(first).getByText('14.11.2026')).toBeTruthy();
    expect(within(first).getByText('Testperson')).toBeTruthy();
    expect(within(second).getByText('Abschreiber · Verdorben')).toBeTruthy();
    expect(within(second).getByText('Riecht nicht mehr frisch.')).toBeTruthy();
    expect(within(second).getByRole('link', { name: 'Lachsfilet' }).getAttribute('href')).toBe(
      `/stock/articles/${kitchen.articles.salmon.id}`,
    );
    // The same lines on the phone.
    const list = screen.getByRole('list', { name: 'Lagerbewegungen' });
    expect(
      within(list).getByText('Abschreiber · Verdorben · 14.11.2026 · Testperson'),
    ).toBeTruthy();
  });

  it('narrows by type and period, and keeps both in the address', async () => {
    const { user, t, kitchen, router } = await renderApp(<JournalPage />, {
      route: '/stock/journal',
    });
    await journal();
    await user.click(screen.getByRole('radio', { name: 'Abschreiber' }));
    expect(await screen.findByText('In diesem Zeitraum gibt es keine Bewegung.')).toBeTruthy();
    expect(router.state.location.search).toBe('?type=waste');
    // The sums stay those of the whole period.
    expect(within(tile('Wareneingang')).getByText('10 Buchungen')).toBeTruthy();
    await t.useCases['stock.writeOff']({
      commandId: t.cmd(),
      businessId: t.businessId,
      lotId: kitchen.lots.eggs.id,
      quantity: 6,
      reason: 'damaged',
    });
    const table = await journal();
    expect(within(table).getAllByRole('row')).toHaveLength(2);
    expect(within(table).getByText('Abschreiber · Beschädigt')).toBeTruthy();
    expect(screen.getByText('1 Bewegung vom 08.11.2026 bis 14.11.2026.')).toBeTruthy();

    await user.click(screen.getByRole('radio', { name: 'Monat' }));
    expect(await screen.findByText('1 Bewegung vom 01.11.2026 bis 14.11.2026.')).toBeTruthy();
    expect(router.state.location.search).toBe('?type=waste&period=month');
    await user.click(screen.getByRole('radio', { name: '30 Tage' }));
    expect(await screen.findByText('1 Bewegung vom 16.10.2026 bis 14.11.2026.')).toBeTruthy();
    await user.click(screen.getByRole('radio', { name: 'Alle' }));
    await waitFor(() => {
      expect(router.state.location.search).toBe('?period=30');
    });
    expect(await screen.findByText('11 Bewegungen vom 16.10.2026 bis 14.11.2026.')).toBeTruthy();
  });

  it('reads period and type from the address, and prints', async () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => undefined);
    const { user } = await renderApp(<JournalPage />, {
      route: '/stock/journal?period=30&type=receipt',
    });
    await journal();
    expect(screen.getByRole('radio', { name: '30 Tage' }).getAttribute('aria-checked')).toBe(
      'true',
    );
    expect(screen.getByRole<HTMLInputElement>('radio', { name: 'Wareneingang' }).checked).toBe(
      true,
    );
    await user.click(screen.getByRole('button', { name: 'Drucken' }));
    expect(print).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Testküche · 16.10.2026 bis 14.11.2026')).toBeTruthy();
  });
});
