import { alive, type Id } from '@randen/core';
import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { paths } from '../../app/paths';
import { renderApp, type AppView } from '../../app/test-helpers';
import { recipesMessages } from './messages';
import { RecipeDetailPage } from './RecipeDetailPage';
import { RecipeEditPage, RecipeNewPage } from './RecipeFormPage';

const t = recipesMessages.form;
const detailRoute = { path: '/recipes/:recipeId', element: <RecipeDetailPage /> };

async function renderNew() {
  const view = await renderApp(<RecipeNewPage />, {
    route: paths.recipeNew(),
    path: '/recipes/new',
    routes: [detailRoute],
  });
  await screen.findByRole('heading', { level: 1, name: t.createTitle });
  // The form opens once the editor data is read.
  await screen.findByLabelText(t.name);
  return view;
}

async function renderEdit(pick: (view: AppView) => Id) {
  const view = await renderApp(<RecipeEditPage />, {
    route: '/',
    path: '/recipes/:recipeId/edit',
    routes: [{ path: '/', element: <p>Start</p> }, detailRoute],
  });
  await view.router.navigate(paths.recipeEdit(pick(view)));
  await screen.findByRole('heading', { level: 1, name: t.editTitle });
  await screen.findByLabelText(t.name);
  return view;
}

/** Picks an article for an ingredient line by typing part of its name. */
async function pickIngredient(view: AppView, index: number, typed: string, name: RegExp) {
  const field = screen.getByRole('combobox', { name: t.ingredient(index) });
  await view.user.click(field);
  await view.user.type(field, typed);
  await view.user.click(await screen.findByRole('option', { name }));
}

/** The calm line of figures under the ingredients. */
const totals = () => {
  const line = screen.getByText(t.totals).parentElement;
  if (line === null) {
    throw new Error('No totals');
  }
  return line;
};

describe('RecipeNewPage', () => {
  it('creates a component with its article, costed while typing', async () => {
    const view = await renderNew();
    const { user, t: context } = view;
    await user.type(screen.getByLabelText(t.name), 'Kartoffelstock');
    await user.click(screen.getByRole('radio', { name: t.kinds.component }));
    await user.click(screen.getByRole('radio', { name: t.units.g }));
    await user.type(screen.getByLabelText(t.output), '2');
    // The Richtwert for food made in house is proposed and named as such.
    expect(screen.getByLabelText<HTMLInputElement>(t.shelfLife).value).toBe('2');
    expect(screen.getByText(t.shelfLifeHint(2))).toBeTruthy();

    await pickIngredient(view, 1, 'kartoff', /Kartoffeln/);
    await user.type(screen.getByLabelText(t.quantity(1)), '1500');
    // 1.5 kg net at 80 % yield is 1.875 kg gross × 1.80 = 3.375 → 3.38
    expect(
      await screen.findByText(/brutto 1\.875 kg bei 80 % Ausbeute · Kosten CHF 3\.38/),
    ).toBeTruthy();
    await user.click(screen.getByRole('button', { name: t.addIngredient }));
    await pickIngredient(view, 2, 'rahm', /Vollrahm/);
    await user.type(screen.getByLabelText(t.quantity(2)), '4');
    // + 4 dl cream 2.56 = 5.935 → 5.94 for 2 kg; 2.97 per kg (rounded per 1000 g)
    await waitFor(() => {
      expect(totals().textContent).toContain('Total CHF 5.94 · CHF 2.97 / kg');
    });
    // Milk comes from the cream, before anything is saved.
    expect(screen.getByText(t.derivedFrom('Vollrahm'))).toBeTruthy();

    await user.click(screen.getByRole('button', { name: t.save }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Kartoffelstock' })).toBeTruthy();
    const recipes = alive(await context.storage.recipes.ofBusiness(context.businessId));
    const stored = recipes.find((row) => row.name === 'Kartoffelstock');
    expect(stored).toMatchObject({
      kind: 'component',
      portions: 1,
      shelfLifeDays: 2,
      ingredients: [
        { articleId: view.kitchen.articles.potatoes.id, quantity: 1500 },
        { articleId: view.kitchen.articles.cream.id, quantity: 400 },
      ],
      steps: [],
      output: { quantity: 2000 },
    });
    const articles = alive(await context.storage.articles.ofBusiness(context.businessId));
    expect(articles.find((row) => row.name === 'Kartoffelstock')).toMatchObject({
      kind: 'prepared',
      unit: 'g',
      recipeId: stored?.id,
      allergens: ['milk'],
    });
  });

  it('says when the name is taken', async () => {
    const { user } = await renderNew();
    await user.type(screen.getByLabelText(t.name), 'lachs mit rahmsauce');
    await user.click(screen.getByRole('button', { name: t.save }));
    expect(await screen.findByText(t.duplicate)).toBeTruthy();
  });
});

describe('RecipeEditPage', () => {
  it('shows the live figures of the entrecôte and takes the proposal', async () => {
    const view = await renderEdit((v) => v.kitchen.recipes.entrecoteDish.id);
    const { user, t: context, kitchen } = view;
    const figures = await screen.findByRole('region', { name: t.sections.price });
    await waitFor(() => {
      expect(within(figures).getByText('CHF 38.85')).toBeTruthy();
    });
    expect(within(figures).getByText('CHF 13.71')).toBeTruthy();
    expect(within(figures).getByText('CHF 25.14')).toBeTruthy();
    expect(within(figures).getByText(/35\.3 %/)).toBeTruthy();
    expect(within(figures).getByText(t.proposal('CHF 49.50', '30 %'))).toBeTruthy();

    await user.click(within(figures).getByRole('button', { name: t.takeProposal }));
    await waitFor(() => {
      expect(screen.getByLabelText<HTMLInputElement>(t.price).value).toBe('49.50');
    });
    expect(within(figures).getByText(/29\.9 %/)).toBeTruthy();
    expect(within(figures).getByText(/im Ziel/)).toBeTruthy();

    await user.click(screen.getByRole('button', { name: t.save }));
    await screen.findByRole('heading', {
      level: 1,
      name: 'Entrecôte mit Rotweinjus und Kartoffelstock',
    });
    const stored = await context.storage.recipes.get(kitchen.recipes.entrecoteDish.id);
    expect(stored?.priceRappen).toBe(4950);
    expect(stored?.ingredients).toEqual(kitchen.recipes.entrecoteDish.ingredients);
  });

  it('refuses a component that would contain itself, naming the loop', async () => {
    const view = await renderEdit((v) => v.kitchen.recipes.jus.id);
    const { user, t: context, kitchen } = view;
    await screen.findByRole('combobox', { name: t.ingredient(4) });
    await pickIngredient(view, 4, 'rotweinj', /^Rotweinjus/);
    expect(await screen.findByText(t.loop('Rotweinjus → Rotweinjus'))).toBeTruthy();
    await user.type(screen.getByLabelText(t.quantity(4)), '1');
    await user.click(screen.getByRole('button', { name: t.save }));
    // Nothing is saved; the page stays.
    expect(screen.getByRole('heading', { level: 1, name: t.editTitle })).toBeTruthy();
    const stored = await context.storage.recipes.get(kitchen.recipes.jus.id);
    expect(stored?.ingredients).toEqual(kitchen.recipes.jus.ingredients);
  });

  it('moves and removes ingredients and steps', async () => {
    const view = await renderEdit((v) => v.kitchen.recipes.salmonDish.id);
    const { user, t: context, kitchen } = view;
    await screen.findByRole('combobox', { name: t.ingredient(3) });
    // Butter up to second place, then the cream (now third) out.
    await user.click(screen.getByRole('button', { name: t.moveUp(t.ingredient(3)) }));
    await waitFor(() => {
      expect(screen.getByRole<HTMLInputElement>('combobox', { name: t.ingredient(2) }).value).toBe(
        'Butter',
      );
    });
    await user.click(screen.getByRole('button', { name: t.removeRow(t.ingredient(3)) }));
    await user.click(screen.getByRole('button', { name: t.moveDown(t.step(1)) }));
    await user.click(screen.getByRole('button', { name: t.save }));
    await screen.findByRole('heading', { level: 1, name: 'Lachs mit Rahmsauce' });
    const stored = await context.storage.recipes.get(kitchen.recipes.salmonDish.id);
    expect(stored?.ingredients.map((line) => line.articleId)).toEqual([
      kitchen.articles.salmon.id,
      kitchen.articles.butter.id,
    ]);
    expect(stored?.steps).toEqual(['Rahm einkochen und abschmecken.', 'Lachs braten.']);
  });

  it('keeps the kind of a component a dish uses', async () => {
    await renderEdit((v) => v.kitchen.recipes.jus.id);
    expect(await screen.findByText(t.kindLocked.used)).toBeTruthy();
    expect(screen.getByRole<HTMLInputElement>('radio', { name: t.kinds.dish }).disabled).toBe(true);
  });

  it('says when the recipe does not exist', async () => {
    await renderApp(<RecipeEditPage />, {
      route: paths.recipeEdit('01900000-0000-7000-8000-00000000abcd'),
      path: '/recipes/:recipeId/edit',
    });
    expect(await screen.findByRole('heading', { level: 1, name: 'Nicht gefunden' })).toBeTruthy();
  });
});
