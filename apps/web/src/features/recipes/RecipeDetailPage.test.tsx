import { ArticleSchema, type Id } from '@randen/core';
import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { paths } from '../../app/paths';
import { renderApp, type AppView } from '../../app/test-helpers';
import { ToastProvider } from '../../ui/Toast';
import { recipesMessages } from './messages';
import { RecipeDetailPage } from './RecipeDetailPage';
import { RecipesPage } from './RecipesPage';

const t = recipesMessages.detail;
const listRoute = { path: '/recipes', element: <RecipesPage /> };

/** The detail page in the frame it needs: a start to come from, and the book to go back to. */
async function renderDetail(pick: (view: AppView) => Id) {
  const view = await renderApp(
    <ToastProvider>
      <RecipeDetailPage />
    </ToastProvider>,
    {
      route: '/',
      path: '/recipes/:recipeId',
      routes: [{ path: '/', element: <p>Start</p> }, listRoute],
    },
  );
  await view.router.navigate(paths.recipe(pick(view)));
  return view;
}

/** The dark card of the page. */
async function figures() {
  const label = await screen.findByText(t.costPerPortion);
  const cardElement = label.closest('div');
  if (cardElement === null) {
    throw new Error('No figures card');
  }
  return within(cardElement);
}

describe('RecipeDetailPage', () => {
  it('shows the entrecôte with cost, margin, share and the price proposal, and takes it', async () => {
    const {
      user,
      t: context,
      kitchen,
    } = await renderDetail((view) => view.kitchen.recipes.entrecoteDish.id);
    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: 'Entrecôte mit Rotweinjus und Kartoffelstock',
      }),
    ).toBeTruthy();
    const card = await figures();
    expect(card.getByText('CHF 13.71')).toBeTruthy();
    expect(card.getByText('CHF 42.00')).toBeTruthy();
    expect(card.getByText(t.net('38.85', '3.15'))).toBeTruthy();
    expect(card.getByText('CHF 25.14')).toBeTruthy();
    expect(card.getByText(/35\.3 %/)).toBeTruthy();
    expect(card.getByText(/über dem Ziel/)).toBeTruthy();
    expect(card.getByText(t.proposal('CHF 49.50', '30 %'))).toBeTruthy();

    await user.click(card.getByRole('button', { name: t.takeProposal }));
    // 49.50 → 45.79 net: 29.9 %, within the target.
    await waitFor(async () => {
      expect((await figures()).getByText(/29\.9 %/)).toBeTruthy();
    });
    expect((await figures()).getByText(/im Ziel/)).toBeTruthy();
    expect((await figures()).queryByRole('button', { name: t.takeProposal })).toBeNull();
    const stored = await context.storage.recipes.get(kitchen.recipes.entrecoteDish.id);
    expect(stored?.priceRappen).toBe(4950);
  });

  it('declares milk, the sulphites of the jus and the origin of the beef', async () => {
    await renderDetail((view) => view.kitchen.recipes.entrecoteDish.id);
    const section = await screen.findByRole('region', { name: t.declaration });
    const allergens = within(section).getByRole('list', { name: 'Allergene' });
    expect(within(allergens).getByText('Milch')).toBeTruthy();
    expect(within(allergens).getByText('Sulfite')).toBeTruthy();
    expect(within(section).getByText('Rindsentrecôte: Schweiz')).toBeTruthy();
    expect(within(section).getByText(t.from('Rotweinjus'))).toBeTruthy();
    expect(within(section).getByText(t.from('Rotweinjus, Vollrahm, Butter'))).toBeTruthy();
  });

  it('rescales the ingredients and says what runs short', async () => {
    const { user, router } = await renderDetail((view) => view.kitchen.recipes.entrecoteDish.id);
    const table = await screen.findByRole('table', { name: t.ingredientsCaption });
    expect(within(table).getByText('1.8 kg')).toBeTruthy();
    const availability = screen.getByRole('region', { name: t.availability });
    expect(within(availability).getByText(t.coversNothing)).toBeTruthy();
    expect(within(availability).getByText(t.firstShort('Rotweinjus'))).toBeTruthy();

    await user.click(
      screen.getByRole('button', { name: recipesMessages.stepper.more(t.portionsLabel) }),
    );
    await waitFor(() => {
      expect(router.state.location.search).toBe('?portions=11');
    });
    // 1.8 kg for 10 portions is 1.98 kg for 11.
    expect(await within(table).findByText('1.98 kg')).toBeTruthy();
    expect(await within(availability).findByText(t.shortLine('Rotweinjus', '550 ml'))).toBeTruthy();
  });

  it('follows a dearer butter without touching the recipe', async () => {
    const { t: context, kitchen } = await renderDetail(
      (view) => view.kitchen.recipes.entrecoteDish.id,
    );
    expect((await figures()).getByText('CHF 13.71')).toBeTruthy();
    await context.storage.articles.put(
      ArticleSchema.parse({ ...kitchen.articles.butter, pricePer1000: 2000 }),
    );
    await waitFor(async () => {
      expect((await figures()).getByText('CHF 13.82')).toBeTruthy();
    });
  });

  it('shows a component with its cost per litre and where it is used, and keeps it while used', async () => {
    const { user } = await renderDetail((view) => view.kitchen.recipes.jus.id);
    expect(await screen.findByRole('heading', { level: 1, name: 'Rotweinjus' })).toBeTruthy();
    expect(screen.getByText(t.costPer('Liter'))).toBeTruthy();
    expect(screen.getByText('CHF 7.89 / l')).toBeTruthy();
    const usedIn = screen.getByRole('region', { name: t.usedIn });
    expect(
      within(usedIn).getByRole('link', { name: /Entrecôte mit Rotweinjus und Kartoffelstock/ }),
    ).toBeTruthy();

    await user.click(screen.getByRole('button', { name: t.remove }));
    const sheet = await screen.findByRole('dialog', { name: t.blockedTitle('Rotweinjus') });
    expect(
      within(sheet).getByText(t.blockedRecipes('Entrecôte mit Rotweinjus und Kartoffelstock')),
    ).toBeTruthy();
  });

  it('deletes a dish after asking, and goes back to the book', async () => {
    const {
      user,
      t: context,
      kitchen,
      router,
    } = await renderDetail((view) => view.kitchen.recipes.salmonDish.id);
    await screen.findByRole('heading', { level: 1, name: 'Lachs mit Rahmsauce' });
    await user.click(screen.getByRole('button', { name: t.remove }));
    const dialog = await screen.findByRole('alertdialog', {
      name: t.removeTitle('Lachs mit Rahmsauce'),
    });
    await user.click(within(dialog).getByRole('button', { name: t.remove }));
    await waitFor(() => {
      expect(router.state.location.pathname).toBe(paths.recipes());
    });
    const stored = await context.storage.recipes.get(kitchen.recipes.salmonDish.id);
    expect(stored?.deletedAt).toBeDefined();
  });

  it('duplicates a dish and opens the copy', async () => {
    const { user, router } = await renderDetail((view) => view.kitchen.recipes.salmonDish.id);
    await screen.findByRole('heading', { level: 1, name: 'Lachs mit Rahmsauce' });
    await user.click(screen.getByRole('button', { name: t.duplicate }));
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Lachs mit Rahmsauce (Kopie)' }),
    ).toBeTruthy();
    expect(router.state.location.pathname).not.toContain('edit');
  });

  it('says when a recipe does not exist', async () => {
    await renderApp(<RecipeDetailPage />, {
      route: paths.recipe('01900000-0000-7000-8000-00000000abcd'),
      path: '/recipes/:recipeId',
    });
    expect(await screen.findByRole('heading', { level: 1, name: 'Nicht gefunden' })).toBeTruthy();
  });
});

describe('RecipeDetailPage with the functions of the business', () => {
  it('offers «Produzieren» only when the business produces', async () => {
    const view = await renderDetail((picked) => picked.kitchen.recipes.entrecoteDish.id);
    expect(await screen.findByRole('link', { name: t.produce })).toBeTruthy();
    await view.t.useCases['business.update']({
      commandId: view.t.cmd(),
      businessId: view.t.businessId,
      modules: ['menu_card', 'ordering'],
    });
    await waitFor(() => {
      expect(screen.queryByRole('link', { name: t.produce })).toBeNull();
    });
    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'Entrecôte mit Rotweinjus und Kartoffelstock',
      }),
    ).toBeTruthy();
  }, 20_000);
});
