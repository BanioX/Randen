import {
  createTestContext,
  seedKitchen,
  type Kitchen,
  type TestContext,
} from '@randen/core/testing';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';
import { AppDataProvider } from '../../app/AppData';
import { RandenDb } from '../../data/db';
import { dexieStorage } from '../../data/dexie-storage';
import { writeDetailed } from '../../app/view';
import { WastePage } from './WastePage';

afterEach(() => {
  window.localStorage.clear();
});

/**
 * Renders a page on a test kitchen that was prepared before the page opens: a write while the
 * page is still reading makes Dexie end its transaction too early (see the cockpit tests).
 */
async function renderPrepared(
  element: ReactElement,
  route: string,
  prepare: (t: TestContext, kitchen: Kitchen) => Promise<void>,
) {
  const db = new RandenDb(`test-${crypto.randomUUID()}`);
  const t = await createTestContext({ storage: dexieStorage(db) });
  const kitchen = await seedKitchen(t);
  await prepare(t, kitchen);
  const router = createMemoryRouter([{ path: '*', element }], { initialEntries: [route] });
  render(
    <AppDataProvider db={db} clock={t.clock} ids={t.ids}>
      <RouterProvider router={router} />
    </AppDataProvider>,
  );
  return { t, kitchen, router, user: userEvent.setup() };
}

describe('Abschreiber of a period', () => {
  it('acceptance: 500 g of salmon spoiled are CHF 19.00 of Lagerverlust and 0.5 kg', async () => {
    await renderPrepared(<WastePage />, '/numbers/waste', async (t, kitchen) => {
      // 500 g Lachs spoiled, through the command of «Lager» (its own transaction).
      await t.useCases['stock.writeOff']({
        commandId: t.cmd(),
        businessId: t.businessId,
        lotId: kitchen.lots.salmon.id,
        quantity: 500,
        reason: 'spoiled',
      });
    });
    // The answer first: the sum, and its share of the purchases of the month (CHF 537.00).
    expect(
      await screen.findByText('Abschreiber: CHF 19.00 in diesem Zeitraum, 3.54 % der Einkäufe.'),
    ).toBeTruthy();
    const kinds = screen.getByRole('table', { name: 'Art' });
    expect(kinds.textContent).toContain('Lagerverlust');
    expect(kinds.textContent).toContain('500 g');
    expect(kinds.textContent).toContain('CHF 19.00');
    // The chart by kind says the same, with «Erweitert».
    expect(
      screen.getByRole('img', { name: /Lagerverlust ist mit CHF 19.00 die grösste Art/ }),
    ).toBeTruthy();
  });

  it('shows the kinds as a table only on the essentials view', async () => {
    writeDetailed(false);
    await renderPrepared(<WastePage />, '/numbers/waste', () => Promise.resolve());
    expect(
      (await screen.findAllByText(/Keine Abschreiber in diesem Zeitraum|Abschreiber: CHF/)).length,
    ).toBeGreaterThan(0);
    expect(screen.queryByRole('img', { name: /grösste Art/ })).toBeNull();
  });

  it('keeps the period in the address', async () => {
    const view = await renderPrepared(<WastePage />, '/numbers/waste', () => Promise.resolve());
    await view.user.click(await screen.findByRole('radio', { name: '7 Tage' }));
    expect(view.router.state.location.search).toBe('?period=7');
  });
});
