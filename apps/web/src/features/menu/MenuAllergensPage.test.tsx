import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ALLERGENS } from '@randen/core';
import { paths } from '../../app/paths';
import { renderApp } from '../../app/test-helpers';
import { MenuAllergensPage } from './MenuAllergensPage';
import { menuMessages } from './messages';
import { makeCard, goTo } from './test-helpers';

const t = menuMessages.allergens;
const NOT_A_CARD = '00000000-0000-7000-8000-000000000000';

describe('MenuAllergensPage', () => {
  it('gives every dish against the fourteen allergens, as a real table', async () => {
    const view = await renderApp(<MenuAllergensPage />, {
      route: `/menu/${NOT_A_CARD}/allergens`,
      path: '/menu/:cardId/allergens',
    });
    const { entrecoteDish, salmonDish } = view.kitchen.recipes;
    const cardId = await makeCard(view, 'Abendkarte', [
      { title: 'Hauptgänge', recipeIds: [entrecoteDish.id, salmonDish.id] },
    ]);
    await goTo(view, paths.menuAllergens(cardId));
    const table = await screen.findByRole('table', { name: t.caption });
    const headers = within(table).getAllByRole('columnheader');
    for (const allergen of ALLERGENS) {
      expect(headers.some((header) => header.textContent.includes(allergen.label))).toBe(true);
    }
    const rows = within(table).getAllByRole('row');
    expect(rows).toHaveLength(3);
    const entrecote = within(table).getByRole('rowheader', { name: /Entrecôte mit Rotweinjus/ });
    expect(entrecote).toBeTruthy();
    expect(
      within(table).getByText('Entrecôte mit Rotweinjus und Kartoffelstock, Milch: enthält'),
    ).toBeTruthy();
    expect(
      within(table).getByText('Entrecôte mit Rotweinjus und Kartoffelstock, Sulfite: enthält'),
    ).toBeTruthy();
    expect(
      within(table).getByText(
        'Entrecôte mit Rotweinjus und Kartoffelstock, Nüsse: nicht enthalten',
      ),
    ).toBeTruthy();
    expect(within(table).getByText('Rindsentrecôte: Schweiz')).toBeTruthy();
    expect(within(table).getByText('Lachs mit Rahmsauce, Fisch: enthält')).toBeTruthy();
    expect(screen.getByRole('button', { name: t.print })).toBeTruthy();
  });

  it('marks traces as possible, not as contained', async () => {
    const view = await renderApp(<MenuAllergensPage />, {
      route: `/menu/${NOT_A_CARD}/allergens`,
      path: '/menu/:cardId/allergens',
    });
    await view.t.storage.recipes.put({ ...view.kitchen.recipes.salmonDish, extraTraces: ['nuts'] });
    const cardId = await makeCard(view, 'Abendkarte', [
      { title: 'Hauptgänge', recipeIds: [view.kitchen.recipes.salmonDish.id] },
    ]);
    await goTo(view, paths.menuAllergens(cardId));
    expect(await screen.findByText('Lachs mit Rahmsauce, Nüsse: Spuren möglich')).toBeTruthy();
  });

  it('says so when the card has no dish yet', async () => {
    const view = await renderApp(<MenuAllergensPage />, {
      route: `/menu/${NOT_A_CARD}/allergens`,
      path: '/menu/:cardId/allergens',
    });
    const cardId = await makeCard(view, 'Leer');
    await goTo(view, paths.menuAllergens(cardId));
    expect(await screen.findByText(t.emptyTitle)).toBeTruthy();
  });

  it('says the card is not there for an address that leads nowhere', async () => {
    await renderApp(<MenuAllergensPage />, {
      route: `/menu/${NOT_A_CARD}/allergens`,
      path: '/menu/:cardId/allergens',
    });
    expect(await screen.findByText(/Diesen Eintrag gibt es nicht mehr\./)).toBeTruthy();
  });
});
