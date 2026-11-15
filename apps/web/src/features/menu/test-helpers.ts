import type { Id } from '@randen/core';
import { act } from '@testing-library/react';
import type { AppView } from '../../app/test-helpers';

/** A card made through the commands on the page's own database, for a page test. */
export async function makeCard(
  view: AppView,
  name: string,
  sections: { title: string; recipeIds: Id[] }[] = [],
  options: { published?: boolean; showPrices?: boolean; showPhotos?: boolean } = {},
): Promise<Id> {
  const t = view.t;
  const { cardId } = await t.useCases['menu.create']({
    commandId: t.cmd(),
    businessId: t.businessId,
    name,
    showPrices: options.showPrices ?? true,
    showPhotos: options.showPhotos ?? true,
  });
  if (sections.length > 0) {
    await t.useCases['menu.setSections']({
      commandId: t.cmd(),
      businessId: t.businessId,
      cardId,
      sections,
    });
  }
  if (options.published === true) {
    await t.useCases['menu.setPublished']({
      commandId: t.cmd(),
      businessId: t.businessId,
      cardId,
      published: true,
    });
  }
  return cardId;
}

/** Moves the open page to another address, e.g. to a card made after the render. */
export async function goTo(view: AppView, address: string): Promise<void> {
  await act(async () => {
    await view.router.navigate(address);
  });
}

/** A dish of the test kitchen, written to the page's database: for pickers and lists. */
export async function addDishTo(
  view: AppView,
  name: string,
  fields: { priceRappen?: number; ingredientIds?: Id[] } = {},
): Promise<Id> {
  const t = view.t;
  const { RecipeSchema } = await import('@randen/core');
  const now = t.clock.now();
  const row = RecipeSchema.parse({
    id: t.ids.next(),
    businessId: t.businessId,
    createdAt: now,
    updatedAt: now,
    name,
    kind: 'dish',
    course: 'starter',
    portions: 1,
    ingredients: (fields.ingredientIds ?? []).map((articleId) => ({ articleId, quantity: 100 })),
    steps: [],
    vatBps: 810,
    extraAllergens: [],
    extraTraces: [],
    labels: [],
    active: true,
    priceRappen: fields.priceRappen ?? 1200,
  });
  await t.storage.recipes.add(row);
  return row.id;
}
