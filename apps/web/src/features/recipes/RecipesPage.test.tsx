import { RecipeSchema } from '@randen/core';
import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { paths } from '../../app/paths';
import { renderApp } from '../../app/test-helpers';
import { recipesMessages } from './messages';
import { RecipesPage } from './RecipesPage';

const t = recipesMessages;

async function renderList(route = paths.recipes()) {
  const view = await renderApp(<RecipesPage />, { route, path: '/recipes' });
  await screen.findByRole('heading', { level: 1, name: t.title });
  return view;
}

/** The card of a recipe, by its name. */
async function card(name: string) {
  const list = await screen.findByRole('list', { name: t.list.caption });
  return within(list).getByRole('link', { name: new RegExp(name) });
}

describe('RecipesPage', () => {
  it('shows the dishes of the kitchen with price and food cost share', async () => {
    await renderList();
    expect(await screen.findByText(t.list.subtitle('30 %'))).toBeTruthy();
    const entrecote = await card('Entrecôte mit Rotweinjus');
    expect(within(entrecote).getByText('CHF 42.00')).toBeTruthy();
    // 13.71 of 38.85 net: 35.3 %, over the target of 30 %.
    expect(within(entrecote).getByText('35.3 %')).toBeTruthy();
    expect(within(entrecote).getByText(/über dem Ziel/)).toBeTruthy();
    expect(entrecote.getAttribute('href')).toMatch(/^\/recipes\//);
    const salmon = await card('Lachs mit Rahmsauce');
    expect(within(salmon).getByText('21.3 %')).toBeTruthy();
    // Components are a view of their own.
    expect(screen.queryByRole('link', { name: /^Rotweinjus/ })).toBeNull();
  });

  it('shows components with what a litre costs', async () => {
    const { user } = await renderList();
    await user.click(await screen.findByRole('radio', { name: /Komponenten 1/ }));
    const jus = await card('Rotweinjus');
    expect(within(jus).getByText('CHF 7.89 / l')).toBeTruthy();
    expect(within(jus).getByText(`${t.component} · 1 l`)).toBeTruthy();
  });

  it('keeps search and view in the address and says when nothing matches', async () => {
    const { user, router } = await renderList();
    await screen.findByRole('list', { name: t.list.caption });
    const [overTarget] = screen.getAllByRole('radio', { name: /Über dem Ziel \(1\)/ });
    if (overTarget === undefined) {
      throw new Error('No view «Über dem Ziel»');
    }
    await user.click(overTarget);
    await waitFor(() => {
      expect(router.state.location.search).toBe('?filter=over_target');
    });
    await waitFor(() => {
      expect(screen.queryByRole('link', { name: /Lachs mit Rahmsauce/ })).toBeNull();
    });
    expect(await card('Entrecôte mit Rotweinjus')).toBeTruthy();

    await user.type(screen.getByRole('searchbox', { name: t.list.search }), 'Pizza');
    expect(await screen.findByText(t.list.noMatch)).toBeTruthy();
    expect(router.state.location.search).toContain('q=Pizza');
  });

  it('marks a dish whose numbers are incomplete', async () => {
    const { t: context, kitchen } = await renderList();
    await card('Lachs mit Rahmsauce');
    const withoutPrice: Record<string, unknown> = { ...kitchen.recipes.salmonDish };
    delete withoutPrice.priceRappen;
    await context.storage.recipes.put(RecipeSchema.parse(withoutPrice));
    const salmon = await waitFor(async () => {
      const found = await card('Lachs mit Rahmsauce');
      expect(within(found).getByText(t.incomplete)).toBeTruthy();
      return found;
    });
    expect(within(salmon).getByText(t.list.noPrice)).toBeTruthy();
  });

  it('invites the first recipe when the book is empty', async () => {
    const { t: context, kitchen } = await renderList();
    await card('Lachs mit Rahmsauce');
    const now = context.clock.now();
    for (const recipe of Object.values(kitchen.recipes)) {
      await context.storage.recipes.put({ ...recipe, deletedAt: now });
    }
    expect(await screen.findByText(t.list.emptyTitle)).toBeTruthy();
    expect(screen.getByRole('link', { name: t.create }).getAttribute('href')).toBe(
      paths.recipeNew(),
    );
  });

  it('links to the price what-if from the header', async () => {
    await renderList();
    const link = await screen.findByRole('link', { name: 'Preisänderung durchrechnen' });
    expect(link.getAttribute('href')).toBe('/recipes/price-change');
  });
});
