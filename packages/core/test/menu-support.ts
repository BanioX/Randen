import { CommandError, RecipeSchema, type DomainEvent, type Id, type Recipe } from '../src';
import { createTestContext, seedKitchen, type TestContext } from '../src/testing';

/** A tiny JPEG as a data URL: the photo of a dish. */
export const PHOTO = 'data:image/jpeg;base64,/9j/4AAQSkZJRg==';

export async function setup() {
  const t = await createTestContext();
  const kitchen = await seedKitchen(t);
  return { t, kitchen, run: t.useCases, businessId: t.businessId };
}

export type Setup = Awaited<ReturnType<typeof setup>>;

/** The error a refused command threw, to look at its code and message. */
export async function refusal(promise: Promise<unknown>): Promise<CommandError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof CommandError) {
      return error;
    }
    throw error;
  }
  throw new Error('Expected the command to be refused');
}

export async function eventsOf(t: TestContext, type: string): Promise<DomainEvent[]> {
  return (await t.storage.events.ofBusiness(t.businessId)).filter((event) => event.type === type);
}

/** How much is written down: a repeated command must leave all of it alone. */
export async function sizes(t: TestContext) {
  const [cards, events] = await Promise.all([
    t.storage.menuCards.ofBusiness(t.businessId),
    t.storage.events.ofBusiness(t.businessId),
  ]);
  return { cards: cards.length, events: events.length };
}

/** A new dish in the kitchen, written straight to storage (the recipes module is not under test). */
export async function addDish(
  s: Setup,
  fields: Partial<Omit<Recipe, 'id' | 'businessId'>> & Pick<Recipe, 'name'>,
): Promise<Id> {
  const now = s.t.clock.now();
  const row = RecipeSchema.parse({
    id: s.t.ids.next(),
    businessId: s.businessId,
    createdAt: now,
    updatedAt: now,
    kind: 'dish',
    course: 'main',
    portions: 1,
    ingredients: [],
    steps: [],
    vatBps: 810,
    extraAllergens: [],
    extraTraces: [],
    labels: [],
    active: true,
    priceRappen: 1000,
    ...fields,
  });
  await s.t.storage.recipes.add(row);
  return row.id;
}

/** Creates a card through the commands; sections are given as titles and recipe ids. */
export async function addCard(
  s: Setup,
  name: string,
  sections: { title: string; recipeIds: Id[] }[] = [],
  options: { published?: boolean; showPrices?: boolean; showPhotos?: boolean } = {},
): Promise<Id> {
  const { cardId } = await s.run['menu.create']({
    commandId: s.t.cmd(),
    businessId: s.businessId,
    name,
    showPrices: options.showPrices ?? true,
    showPhotos: options.showPhotos ?? true,
  });
  if (sections.length > 0) {
    await s.run['menu.setSections']({
      commandId: s.t.cmd(),
      businessId: s.businessId,
      cardId,
      sections,
    });
  }
  if (options.published === true) {
    await s.run['menu.setPublished']({
      commandId: s.t.cmd(),
      businessId: s.businessId,
      cardId,
      published: true,
    });
  }
  return cardId;
}

/** Every dish of the test kitchen with a photo, so no photo problem stands in the way. */
export async function givePhotos(s: Setup): Promise<void> {
  for (const recipe of [s.kitchen.recipes.entrecoteDish, s.kitchen.recipes.salmonDish]) {
    await s.t.storage.recipes.put({ ...recipe, photo: PHOTO });
  }
}

/** A copy of a row without one optional field (the types forbid `undefined` for it). */
export function without<TRow extends object>(row: TRow, key: keyof TRow): TRow {
  const copy: Partial<TRow> = { ...row };
  Reflect.deleteProperty(copy, key);
  return copy as TRow;
}
