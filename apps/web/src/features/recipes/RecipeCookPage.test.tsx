import { type Id } from '@randen/core';
import { screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { paths } from '../../app/paths';
import { renderApp, type AppView } from '../../app/test-helpers';
import { recipesMessages } from './messages';
import { RecipeCookPage } from './RecipeCookPage';

const t = recipesMessages.cook;

async function renderCook(pick: (view: AppView) => Id) {
  const view = await renderApp(<RecipeCookPage />, {
    route: '/',
    path: '/recipes/:recipeId/cook',
    routes: [{ path: '/', element: <p>Start</p> }],
  });
  await view.router.navigate(paths.recipeCook(pick(view)));
  return view;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('RecipeCookPage', () => {
  it('shows the recipe large, with allergens first, and rescales it for the service', async () => {
    const { user, router } = await renderCook((view) => view.kitchen.recipes.entrecoteDish.id);
    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: 'Entrecôte mit Rotweinjus und Kartoffelstock',
      }),
    ).toBeTruthy();
    const allergens = screen.getByRole('region', { name: t.allergens });
    expect(within(allergens).getByText('Milch')).toBeTruthy();
    expect(within(allergens).getByText('Sulfite')).toBeTruthy();
    const ingredients = screen.getByRole('region', { name: t.ingredients });
    expect(within(ingredients).getByText('1.8 kg')).toBeTruthy();
    expect(within(ingredients).getByText('5 dl')).toBeTruthy();

    const field = screen.getByLabelText<HTMLInputElement>(t.portions);
    await user.clear(field);
    await user.type(field, '4');
    await waitFor(() => {
      expect(router.state.location.search).toBe('?portions=4');
    });
    // 1.8 kg for 10 portions is 720 g for 4; 5 dl jus is 2 dl.
    expect(await within(ingredients).findByText('720 g')).toBeTruthy();
    expect(within(ingredients).getByText('2 dl')).toBeTruthy();
    await user.click(
      screen.getByRole('button', { name: recipesMessages.stepper.less(t.portions) }),
    );
    expect(await within(ingredients).findByText('540 g')).toBeTruthy();
  });

  it('ticks off steps and prints the card', async () => {
    const { user } = await renderCook((view) => view.kitchen.recipes.jus.id);
    await screen.findByRole('heading', { level: 1, name: 'Rotweinjus' });
    expect(screen.getByText(`${t.forBatches(1)} · ${t.gives('1 l')}`)).toBeTruthy();
    const step = screen.getByRole('button', { name: '1. Zwiebeln anschwitzen.' });
    expect(step.getAttribute('aria-pressed')).toBe('false');
    await user.click(step);
    expect(step.getAttribute('aria-pressed')).toBe('true');
    await user.click(step);
    expect(step.getAttribute('aria-pressed')).toBe('false');

    const print = vi.spyOn(window, 'print').mockImplementation(() => undefined);
    await user.click(screen.getByRole('button', { name: t.print }));
    expect(print).toHaveBeenCalledOnce();
  });

  it('says when the recipe does not exist', async () => {
    await renderApp(<RecipeCookPage />, {
      route: paths.recipeCook('01900000-0000-7000-8000-00000000abcd'),
      path: '/recipes/:recipeId/cook',
    });
    expect(await screen.findByRole('heading', { level: 1, name: 'Nicht gefunden' })).toBeTruthy();
  });
});
