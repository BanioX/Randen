import {
  addDays,
  BudgetSchema,
  createStockLedger,
  MealCountSchema,
  PlanEntrySchema,
  ShoppingLineSchema,
} from '@randen/core';
import { createTestContext, seedKitchen, type TestContext } from '@randen/core/testing';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';
import { AppDataProvider } from '../../app/AppData';
import { renderApp, type AppView } from '../../app/test-helpers';
import { writeDetailed } from '../../app/view';
import { RandenDb } from '../../data/db';
import { dexieStorage } from '../../data/dexie-storage';
import { CockpitPage } from './CockpitPage';

/**
 * The test kitchen on Saturday, 14.11.2026 (see `seedKitchen`): CHF 537.00 in ten lots, the
 * salmon (CHF 57.00) is due tomorrow, the entrecôte (CHF 248.00) in two days, the flour is under
 * its minimum, and no area has a temperature of today.
 */
afterEach(() => {
  window.localStorage.clear();
});

const open = () => renderApp(<CockpitPage />, { route: '/' });

/** The calendar moves on while the app is open: the app notices when it comes back to the front. */
function moveDays(view: AppView, days: number) {
  view.t.clock.setToday(addDays(view.t.clock.today(), days));
  fireEvent(document, new Event('visibilitychange'));
}

const today = () => screen.findByRole('list', { name: 'Was heute zu tun ist' });
const useUp = () => screen.findByRole('list', { name: /Chargen, die in den nächsten drei Tagen/ });

/** The test kitchen (see `seedKitchen`) set up as a kind of business before the page opens. */
type KitchenKind =
  /** Nothing in it yet: what a new business sees first. */
  | 'empty'
  /** A kebab shop alone: fetches its goods at the cash & carry, the essentials on the device. */
  | 'kebab'
  /** A care home: plans and counts meals, numbers, no sales of dishes. */
  | 'care';

async function renderKitchen(
  element: ReactElement,
  kind: KitchenKind,
  options: { route?: string; prepare?: (t: TestContext) => Promise<void> } = {},
) {
  const db = new RandenDb(`test-${crypto.randomUUID()}`);
  const t = await createTestContext({ storage: dexieStorage(db) });
  const kitchen = kind === 'empty' ? undefined : await seedKitchen(t);
  if (kind === 'kebab') {
    // «Imbiss», «Ich hole sie selbst», «Ich allein»: the setup proposes the menu card and the
    // market, nothing else, and the essentials on this device.
    await t.useCases['business.setup']({
      commandId: t.cmd(),
      businessId: t.businessId,
      kind: 'takeaway',
      sources: { pickup: true, delivered: false, orders: false },
      team: 'solo',
      eating: 'away',
      name: 'Imbiss Beispiel',
    });
    writeDetailed(false);
  }
  if (kind === 'care') {
    await t.useCases['business.update']({
      commandId: t.cmd(),
      businessId: t.businessId,
      modules: ['ordering', 'production', 'planning', 'meals', 'numbers'],
    });
  }
  await options.prepare?.(t);
  const router = createMemoryRouter([{ path: '*', element }], {
    initialEntries: [options.route ?? '/'],
  });
  render(
    <AppDataProvider db={db} clock={t.clock} ids={t.ids}>
      <RouterProvider router={router} />
    </AppDataProvider>,
  );
  return { t, kitchen, router, user: userEvent.setup() };
}

/** The fields every new row of the test business carries. */
function base(t: TestContext) {
  const now = t.clock.now();
  return { id: t.ids.next(), businessId: t.businessId, createdAt: now, updatedAt: now };
}

describe('CockpitPage', () => {
  it('shows the day first, then the key figures, what to use up and the dishes', async () => {
    const { kitchen } = await open();
    expect(await screen.findByRole('heading', { level: 1, name: 'Cockpit' })).toBeTruthy();
    expect(screen.getByText('Samstag, 14. November 2026')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Wareneingang' }).getAttribute('href')).toBe(
      '/stock/receive',
    );

    // Not set up yet: the offer to set Randen up stands on top (ADR-0015).
    expect(screen.getByText('Randen einrichten')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Einrichten' }).getAttribute('href')).toBe('/setup');

    // «Heute»: the temperatures of both cold areas, and the flour to buy. The test kitchen has
    // every function: it orders and it fetches at the market, so the row says «Nachkaufen».
    const day = await today();
    const temperature = within(day).getByRole('link', { name: /Temperatur messen/ });
    expect(within(temperature).getByText('Kühlzelle, Tiefkühlzelle')).toBeTruthy();
    expect(temperature.getAttribute('href')).toBe('/haccp/temperatures');
    const reorder = within(day).getByRole('link', { name: /Nachkaufen/ });
    expect(within(reorder).getByText('Weissmehl')).toBeTruthy();
    expect(reorder.getAttribute('href')).toBe('/purchasing');
    expect(within(day).getAllByRole('listitem')).toHaveLength(2);

    // The key figures, the stock value on the one dark card.
    const value = screen.getByRole('link', { name: /Lagerwert/ });
    expect(within(value).getByText('537.00')).toBeTruthy();
    expect(within(value).getByText('9 Artikel in 2 Lagerbereichen')).toBeTruthy();
    const foodCost = screen.getByRole('link', { name: /Wareneinsatz November/ });
    expect(within(foodCost).getByText('offen')).toBeTruthy();
    expect(within(foodCost).getByText('Noch kein Umsatz im November erfasst')).toBeTruthy();
    expect(screen.getByRole('link', { name: /Abschreiber diese Woche/ })).toBeTruthy();
    expect(screen.getByText('Diese und letzte Woche nichts abgeschrieben')).toBeTruthy();
    const due = screen.getByRole('link', { name: /Läuft heute ab/ });
    expect(within(due).getByText('0 Chargen')).toBeTruthy();
    expect(due.getAttribute('href')).toBe('/stock/expiring?group=today');

    // «Heute verwerten»: Lachs tomorrow, Entrecôte in two days, with their values.
    const lots = await useUp();
    const salmon = within(lots).getByRole('link', { name: /Lachsfilet/ });
    expect(within(salmon).getByText('CHF 57.00')).toBeTruthy();
    expect(within(salmon).getByText('1.5 kg · Kühlzelle')).toBeTruthy();
    expect(within(salmon).getByText('morgen')).toBeTruthy();
    expect(salmon.getAttribute('href')).toBe(`/stock/articles/${kitchen.articles.salmon.id}`);
    const entrecote = within(lots).getByRole('link', { name: /Rindsentrecôte/ });
    expect(within(entrecote).getByText('CHF 248.00')).toBeTruthy();
    expect(within(entrecote).getByText('4 kg · Kühlzelle · Schublade Fleisch')).toBeTruthy();
    expect(within(entrecote).getByText('in 2 Tagen')).toBeTruthy();
    expect(screen.getByText('2 Chargen · CHF 305.00')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Im Menüplan verwerten' }).getAttribute('href')).toBe(
      '/plan',
    );

    // Budget and write-offs say calmly that there is nothing yet: no empty chart.
    expect(screen.getByText('Für November ist noch kein Budget erfasst.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Budget erfassen' }).getAttribute('href')).toBe(
      '/numbers/budget',
    );
    expect(screen.getByText('In den letzten 30 Tagen wurde nichts abgeschrieben.')).toBeTruthy();
    expect(screen.queryByRole('img')).toBeNull();

    // «Gerichte nach Marge»: the best carries the mark in Traube.
    const table = screen.getByRole('table', { name: 'Gerichte nach Marge' });
    const best = within(table).getByRole('row', { name: /Entrecôte mit Rotweinjus/ });
    expect(within(best).getByText('Beste Marge')).toBeTruthy();
    expect(within(best).getByText('CHF 42.00')).toBeTruthy();
    expect(within(best).getByText('CHF 13.71')).toBeTruthy();
    expect(within(best).getByText('CHF 25.14')).toBeTruthy();
    expect(within(best).getByText('35.3 %')).toBeTruthy();
    expect(
      within(best)
        .getByRole('link', { name: /Entrecôte/ })
        .getAttribute('href'),
    ).toBe(`/recipes/${kitchen.recipes.entrecoteDish.id}`);
    const salmonDish = within(table).getByRole('row', { name: /Lachs mit Rahmsauce/ });
    expect(within(salmonDish).getByText('CHF 24.75')).toBeTruthy();
    expect(within(salmonDish).queryByText('Beste Marge')).toBeNull();
    expect(screen.getByRole('link', { name: 'Alle anzeigen' }).getAttribute('href')).toBe(
      '/numbers/margins',
    );

    // A young business still sees what is open of its first steps, and only that.
    const steps = screen.getByRole('list', { name: 'Erste Schritte' });
    expect(screen.getByText('4 von 6 erledigt')).toBeTruthy();
    expect(within(steps).getAllByRole('link')).toHaveLength(2);
    expect(within(steps).queryByText('erledigt')).toBeNull();
    expect(
      within(steps)
        .getByRole('link', { name: /Speisekarte anlegen/ })
        .getAttribute('href'),
    ).toBe('/menu');
  });

  it('follows the calendar: the salmon is due today, then must not be used any more', async () => {
    const view = await open();
    await useUp();
    moveDays(view, 1);
    const due = await within(await today()).findByRole('link', { name: /Läuft heute ab/ });
    expect(within(due).getByText('Lachsfilet')).toBeTruthy();
    expect(within(due).getByText('CHF 57.00')).toBeTruthy();
    expect(due.getAttribute('href')).toBe('/stock/expiring?group=today');
    const tile = screen.getByRole('link', { name: /Läuft heute ab\s*1 Charge/ });
    expect(within(tile).getByText('Wert CHF 57.00')).toBeTruthy();

    moveDays(view, 1);
    const expired = await within(await today()).findByRole('link', {
      name: /Nicht mehr verwenden/,
    });
    expect(within(expired).getByText('Lachsfilet')).toBeTruthy();
    expect(expired.getAttribute('href')).toBe(`/stock/waste?lot=${view.kitchen.lots.salmon.id}`);
    // What must not be used is no longer offered for using up.
    await waitFor(async () => {
      expect(within(await useUp()).queryByText('Lachsfilet')).toBeNull();
    });
  });

  it('finds articles and recipes while typing and keeps the search in the address', async () => {
    const { user, router, kitchen } = await open();
    await today();
    await user.type(screen.getByLabelText('Im Betrieb suchen'), 'lachs');
    const results = await screen.findByRole('region', { name: 'Suchergebnisse' });
    const article = await within(results).findByRole('link', { name: /Lachsfilet/ });
    expect(within(article).getByText('1.5 kg an Lager · Kühlzelle')).toBeTruthy();
    expect(article.getAttribute('href')).toBe(`/articles/${kitchen.articles.salmon.id}`);
    const recipe = within(results).getByRole('link', { name: /Lachs mit Rahmsauce/ });
    expect(within(recipe).getByText('Hauptgang · CHF 34.00')).toBeTruthy();
    expect(router.state.location.search).toBe('?q=lachs');

    await user.type(screen.getByLabelText('Im Betrieb suchen'), 'xyz');
    expect(await screen.findByText('Nichts passt zu «lachsxyz».')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Suche leeren' }));
    await waitFor(() => {
      expect(screen.queryByRole('region', { name: 'Suchergebnisse' })).toBeNull();
    });
    expect(router.state.location.search).toBe('');
  });

  it('shows spots and suppliers among the hits', async () => {
    await renderApp(<CockpitPage />, { route: '/?q=regal' });
    const results = await screen.findByRole('region', { name: 'Suchergebnisse' });
    const spot = await within(results).findByRole('link', { name: /Regal 1, oben/ });
    expect(within(spot).getByText('Trockenlager · 1 Artikel')).toBeTruthy();
    expect(spot.getAttribute('href')).toMatch(/^\/areas\//);
  });

  it('draws the write-offs and the budget once there are some', async () => {
    const view = await open();
    await useUp();
    const { t, kitchen } = view;
    // 500 g Lachs spoiled: 19.00 written off this week.
    await t.useCases['stock.writeOff']({
      commandId: t.cmd(),
      businessId: t.businessId,
      lotId: kitchen.lots.salmon.id,
      quantity: 500,
      reason: 'spoiled',
    });
    const now = t.clock.now();
    await t.storage.budgets.add(
      BudgetSchema.parse({
        id: t.ids.next(),
        businessId: t.businessId,
        createdAt: now,
        updatedAt: now,
        month: '2026-11',
        purchaseBudgetRappen: 100_000,
      }),
    );
    expect(
      await screen.findByRole('img', {
        name: 'In den letzten 30 Tagen CHF 19.00 abgeschrieben, am meisten als Lagerverlust mit CHF 19.00.',
      }),
    ).toBeTruthy();
    expect(screen.getByText('CHF 19.00 mehr als letzte Woche')).toBeTruthy();
    // Everything of the test kitchen came in on 13.11.: 537.00 of 1000.00 on day 14 of 30.
    expect(await screen.findByText('CHF 537.00 von CHF 1’000.00')).toBeTruthy();
    expect(screen.getByText('54 % ausgegeben')).toBeTruthy();
    expect(screen.getByText('Tag 14 von 30')).toBeTruthy();
    expect(
      screen.getByRole('img', {
        name: '54 % des Budgets ausgegeben, der Monat ist zu 47 % vorbei.',
      }),
    ).toBeTruthy();
  });

  it('shows a canteen what to produce today and the meals to count', async () => {
    const view = await open();
    await useUp();
    const { t, kitchen } = view;
    const day = t.clock.today();
    await t.storage.planEntries.add(
      PlanEntrySchema.parse({
        ...base(t),
        date: day,
        slot: 'lunch',
        recipeId: kitchen.recipes.salmonDish.id,
        portions: 120,
      }),
    );
    await t.storage.mealCounts.add(
      MealCountSchema.parse({ ...base(t), date: day, slot: 'lunch', expected: 120 }),
    );
    const produce = await within(await today()).findByRole('link', { name: /Heute produzieren/ });
    expect(within(produce).getByText('Lachs mit Rahmsauce')).toBeTruthy();
    expect(produce.getAttribute('href')).toBe('/production');
    const count = within(await today()).getByRole('link', { name: /Mahlzeiten zählen/ });
    expect(within(count).getByText('Mittag, 120 erwartet')).toBeTruthy();
    expect(count.getAttribute('href')).toBe('/plan');
  });
});

describe('CockpitPage, a kebab shop alone', () => {
  it('stays calm: what expires, what is missing for the market, the temperatures, what was thrown away', async () => {
    await renderKitchen(<CockpitPage />, 'kebab', {
      prepare: async (t) => {
        await t.storage.shoppingLines.add(
          ShoppingLineSchema.parse({
            ...base(t),
            text: 'Servietten',
            source: 'manual',
            checked: false,
          }),
        );
        // A plan entry from earlier: the plan is not a function of this kitchen.
        const recipes = await t.storage.recipes.ofBusiness(t.businessId);
        const dish = recipes.find((recipe) => recipe.kind === 'dish');
        await t.storage.planEntries.add(
          PlanEntrySchema.parse({
            ...base(t),
            date: t.clock.today(),
            slot: 'lunch',
            recipeId: dish?.id,
            portions: 10,
          }),
        );
      },
    });
    await useUp();
    expect(screen.getByText('Samstag, 14. November 2026')).toBeTruthy();
    // Set up already, so no offer to do it; the purchase at the market is the main action.
    expect(screen.queryByText('Randen einrichten')).toBeNull();
    expect(screen.getByRole('link', { name: 'Einkauf erfassen' }).getAttribute('href')).toBe(
      '/stock/receive',
    );

    // The day: the temperatures, and the shopping list with the flour and the line by hand.
    const day = await today();
    expect(within(day).getAllByRole('listitem')).toHaveLength(2);
    const list = within(day).getByRole('link', { name: /Einkaufsliste/ });
    expect(within(list).getByText('Weissmehl, Servietten')).toBeTruthy();
    expect(list.getAttribute('href')).toBe('/purchasing');
    expect(within(day).getByRole('link', { name: /Temperatur messen/ })).toBeTruthy();
    expect(within(day).queryByRole('link', { name: /Menüplan|produzieren/ })).toBeNull();

    // Three figures: the stock, what was thrown away this month, what expires today.
    expect(screen.getByRole('link', { name: /Lagerwert/ })).toBeTruthy();
    expect(screen.getByText('Weggeworfen diesen Monat')).toBeTruthy();
    expect(screen.getByText('Im November nichts abgeschrieben')).toBeTruthy();
    expect(screen.getByRole('link', { name: /Läuft heute ab/ })).toBeTruthy();
    expect(screen.queryByText(/Wareneinsatz November/)).toBeNull();
    expect(screen.queryByText('Abschreiber diese Woche')).toBeNull();

    // What to use up leads to the expiry list: there is no menu plan.
    expect(screen.queryByRole('link', { name: 'Im Menüplan verwerten' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Ablauf ansehen' }).getAttribute('href')).toBe(
      '/stock/expiring',
    );
    // No budget, no charts, no ranking of dishes.
    expect(screen.queryByText(/Budget November/)).toBeNull();
    expect(screen.queryByText(/Abschreiber nach Art/)).toBeNull();
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.queryByRole('img')).toBeNull();
    // The spots belong to «Wo ist was?», which a cook alone does not use.
    expect(screen.getByText('3 von 5 erledigt')).toBeTruthy();
    expect(screen.queryByRole('link', { name: /Plätze einrichten/ })).toBeNull();
  });

  it('finds no spots without «Wo ist was?», and calls a market a market', async () => {
    await renderKitchen(<CockpitPage />, 'kebab', {
      route: '/?q=regal',
      prepare: async (t) => {
        const now = t.clock.now();
        await t.storage.suppliers.add({
          id: t.ids.next(),
          businessId: t.businessId,
          createdAt: now,
          updatedAt: now,
          name: 'Regal-Markt Nord',
          kind: 'market',
          orderDays: [],
          deliveryDays: [],
        });
      },
    });
    const results = await screen.findByRole('region', { name: 'Suchergebnisse' });
    const market = await within(results).findByRole('link', { name: /Regal-Markt Nord/ });
    expect(within(market).getByText('Markt · 0 Artikel')).toBeTruthy();
    expect(within(results).queryByRole('link', { name: /Regal 1, oben/ })).toBeNull();
  });
});

describe('CockpitPage, a care home', () => {
  it('shows the goods per meal instead of a share of sales, and orders what is missing', async () => {
    await renderKitchen(<CockpitPage />, 'care', {
      prepare: async (t) => {
        const kitchen = await t.storage.articles.ofBusiness(t.businessId);
        const entrecote = kitchen.find((article) => article.name === 'Rindsentrecôte');
        // 2 kg Entrecôte × 62.00 = 124.00 for 20 meals: 6.20 each, against 7.00.
        await t.storage.transaction(async () => {
          await createStockLedger(t.ctx).consume({
            businessId: t.businessId,
            articleId: entrecote?.id ?? t.ids.next(),
            quantity: 2000,
            on: t.clock.today(),
            purpose: 'sale',
          });
        });
        await t.storage.mealCounts.add(
          MealCountSchema.parse({ ...base(t), date: t.clock.today(), slot: 'lunch', served: 20 }),
        );
        await t.storage.budgets.add(
          BudgetSchema.parse({
            ...base(t),
            month: '2026-11',
            purchaseBudgetRappen: 100_000,
            costPerMealRappen: 700,
          }),
        );
      },
    });
    const tile = await screen.findByRole('link', { name: /Wareneinsatz pro Mahlzeit/ });
    expect(within(tile).getByText('6.20')).toBeTruthy();
    expect(within(tile).getByText('Ziel CHF 7.00, im Ziel')).toBeTruthy();
    expect(tile.getAttribute('href')).toBe('/numbers');
    expect(screen.queryByText(/Wareneinsatz November/)).toBeNull();
    // It orders from its suppliers: what is under its minimum goes into the order proposal.
    const order = within(await today()).getByRole('link', { name: /Bestellen/ });
    expect(within(order).getByText('Weissmehl')).toBeTruthy();
    expect(order.getAttribute('href')).toBe('/purchasing');
    // Without the sales of dishes, «Alle anzeigen» leads to the recipes.
    expect(screen.getByRole('link', { name: 'Alle anzeigen' }).getAttribute('href')).toBe(
      '/recipes',
    );
  });
});

describe('CockpitPage, an empty business', () => {
  it('offers the first steps and the demo business, and no empty charts', async () => {
    await renderKitchen(<CockpitPage />, 'empty');
    expect(
      await screen.findByRole('heading', { level: 2, name: 'Demo-Betrieb laden' }),
    ).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Demo-Betrieb laden' }).getAttribute('href')).toBe(
      '/more/demo',
    );
    const steps = screen.getByRole('list', { name: 'Erste Schritte' });
    expect(within(steps).getAllByRole('link')).toHaveLength(6);
    expect(screen.getByText('0 von 6 erledigt')).toBeTruthy();
    expect(
      within(steps)
        .getByRole('link', { name: /Fünf Artikel erfassen/ })
        .getAttribute('href'),
    ).toBe('/articles');
    expect(
      within(steps)
        .getByRole('link', { name: /Ersten Wareneingang buchen/ })
        .getAttribute('href'),
    ).toBe('/stock/receive');
    expect(screen.queryByText('Lagerwert')).toBeNull();
    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.queryByLabelText('Im Betrieb suchen')).toBeNull();
    // A new business is offered the setup first.
    expect(screen.getByRole('link', { name: 'Einrichten' }).getAttribute('href')).toBe('/setup');
  });
});

describe('CockpitPage, user events', () => {
  it('opens the row of the day it was tapped on', async () => {
    const { router, user } = await renderApp(<CockpitPage />, {
      route: '/',
      routes: [{ path: '/haccp/temperatures', element: <p>Temperaturen</p> }],
    });
    await user.click(within(await today()).getByRole('link', { name: /Temperatur messen/ }));
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/haccp/temperatures');
    });
  });
});
