/**
 * What a menu card shows, worked out from its recipes and their ingredients (ADR-0008): the
 * dishes of the editor, the guest view, the allergen matrix and the open points. Pure functions
 * on rows already read from storage, so the rules can be tested without a database.
 */
import {
  ALLERGENS,
  sortAllergens,
  allergenLabel,
  allergenOfficial,
  type AllergenId,
  type Diet,
} from '../../domain/allergens';
import {
  countryName,
  declarationOf,
  type Declaration,
  type DeclarationBook,
} from '../../domain/declaration';
import type { Id } from '../../ids';
import type { Article } from '../../model/article';
import type { Business } from '../../model/business';
import type { MenuCard } from '../../model/menu';
import { dishLabelText, type Course, type Recipe } from '../../model/recipe';
import type {
  MenuCardSummary,
  MenuCardView,
  GuestDish,
  GuestSection,
  AllergenRef,
  DishOrigin,
  AllergenSheetRow,
  AllergenState,
  MenuDishRow,
} from './contract';

/** A dish the card names but the business no longer has as a live dish. */
export const UNKNOWN_DISH = 'Unbekanntes Gericht';

/** The rows the rules read: the business name and every row of articles and recipes. */
export interface MenuBook {
  businessName: string;
  /** Every recipe row, deleted ones too: a card can still name what was removed. */
  recipes: ReadonlyMap<Id, Recipe>;
  /** Live articles and recipes only, for the declaration. */
  declaration: DeclarationBook;
}

export function menuBook(
  business: Business,
  articles: readonly Article[],
  recipes: readonly Recipe[],
): MenuBook {
  const liveRecipes = recipes.filter((row) => row.deletedAt === undefined);
  return {
    businessName: business.name,
    recipes: new Map(recipes.map((row) => [row.id, row])),
    declaration: {
      articles: new Map(articles.map((row) => [row.id, row])),
      recipes: new Map(liveRecipes.map((row) => [row.id, row])),
    },
  };
}

export type DishProblemKind =
  'missing' | 'not_dish' | 'inactive' | 'price' | 'photo' | 'declaration' | 'origin';

export interface DishProblem {
  kind: DishProblemKind;
  /** The words a person reads: «Preis fehlt», «Herkunft fehlt: Rindsentrecôte». */
  text: string;
}

/** One dish of a card as the rules see it. */
export interface DishState {
  id: Id;
  name: string;
  course: Course;
  /** A live recipe of kind dish: the only kind a card may show. */
  isDish: boolean;
  active: boolean;
  recipe?: Recipe;
  declaration?: Declaration;
  problems: DishProblem[];
}

/** Whether the guest needs to ask the staff: the declaration is not complete. */
export function isIncomplete(declaration: Declaration): boolean {
  return (
    declaration.incomplete || declaration.origins.some((origin) => origin.country === undefined)
  );
}

/** The open points of one dish, for the card's settings (price and photo only if shown). */
export function analyseDish(
  recipeId: Id,
  card: Pick<MenuCard, 'showPrices' | 'showPhotos'>,
  book: MenuBook,
): DishState {
  const row = book.recipes.get(recipeId);
  if (row === undefined || row.deletedAt !== undefined) {
    return {
      id: recipeId,
      name: row?.name ?? UNKNOWN_DISH,
      course: row?.course ?? 'other',
      isDish: false,
      active: false,
      problems: [{ kind: 'missing', text: 'Rezept ist gelöscht' }],
    };
  }
  if (row.kind !== 'dish') {
    return {
      id: row.id,
      name: row.name,
      course: row.course,
      isDish: false,
      active: row.active,
      problems: [{ kind: 'not_dish', text: 'Komponente, kein Gericht' }],
    };
  }
  const declaration = declarationOf(row, book.declaration);
  const problems: DishProblem[] = [];
  if (!row.active) {
    problems.push({ kind: 'inactive', text: 'Rezept ist nicht aktiv' });
  }
  if (card.showPrices && (row.priceRappen === undefined || row.priceRappen <= 0)) {
    problems.push({ kind: 'price', text: 'Preis fehlt' });
  }
  if (card.showPhotos && row.photo === undefined) {
    problems.push({ kind: 'photo', text: 'Foto fehlt' });
  }
  if (declaration.incomplete) {
    problems.push({ kind: 'declaration', text: 'Deklaration unvollständig' });
  }
  const missingOrigin = declaration.origins.filter((origin) => origin.country === undefined);
  if (missingOrigin.length > 0) {
    problems.push({
      kind: 'origin',
      text: `Herkunft fehlt: ${missingOrigin.map((origin) => origin.name).join(', ')}`,
    });
  }
  return {
    id: row.id,
    name: row.name,
    course: row.course,
    isDish: true,
    active: row.active,
    recipe: row,
    declaration,
    problems,
  };
}

export function cardView(card: MenuCard): MenuCardView {
  return {
    id: card.id,
    name: card.name,
    ...(card.intro === undefined ? {} : { intro: card.intro }),
    ...(card.footer === undefined ? {} : { footer: card.footer }),
    showPrices: card.showPrices,
    showPhotos: card.showPhotos,
    published: card.published,
  };
}

function editorDish(state: DishState): MenuDishRow {
  const price = state.isDish ? state.recipe?.priceRappen : undefined;
  return {
    id: state.id,
    name: state.name,
    course: state.course,
    ...(price === undefined || price <= 0 ? {} : { priceRappen: price }),
    hasPhoto: state.recipe?.photo !== undefined,
    ...(state.recipe?.photo === undefined ? {} : { photo: state.recipe.photo }),
    active: state.active,
    problems: state.problems.map((problem) => problem.text),
  };
}

/** The sections and the open points of a card, as the editor shows them. */
export function editorView(card: MenuCard, book: MenuBook) {
  const sections = card.sections.map((section) => ({
    id: section.id,
    title: section.title,
    dishes: section.recipeIds.map((recipeId) => editorDish(analyseDish(recipeId, card, book))),
  }));
  const problems = sections.flatMap((section) =>
    section.dishes
      .filter((dish) => dish.problems.length > 0)
      .map((dish) => ({ dishId: dish.id, name: dish.name, problems: dish.problems })),
  );
  return {
    sections,
    problems,
    problemCount: problems.reduce((sum, entry) => sum + entry.problems.length, 0),
  };
}

/** One row of the list: the numbers the row shows. */
export function summaryOf(card: MenuCard, book: MenuBook): MenuCardSummary {
  return {
    id: card.id,
    name: card.name,
    published: card.published,
    sectionCount: card.sections.length,
    dishCount: card.sections.reduce((sum, section) => sum + section.recipeIds.length, 0),
    problems: editorView(card, book).problemCount,
  };
}

export function allergenRef(id: AllergenId): AllergenRef {
  return { id, label: allergenLabel(id), official: allergenOfficial(id) };
}

/** The fourteen allergens in the order of the ordinance (LIV Anhang 6). */
export const ALLERGEN_REFS: readonly AllergenRef[] = ALLERGENS.map((allergen) =>
  allergenRef(allergen.id),
);

const DIET_ORDER: readonly Diet[] = ['vegan', 'vegetarian', 'omnivore'];

function originOf(origin: { name: string; country: string | undefined }): DishOrigin {
  return {
    name: origin.name,
    ...(origin.country === undefined
      ? {}
      : { country: origin.country, countryName: countryName(origin.country) }),
  };
}

/** A dish as the guest reads it. Only what the card is set to show. */
function guestDish(state: DishState, card: MenuCard): GuestDish | undefined {
  const { recipe, declaration } = state;
  if (recipe === undefined || declaration === undefined || !state.isDish || !state.active) {
    return undefined;
  }
  const price = recipe.priceRappen;
  return {
    id: recipe.id,
    name: recipe.name,
    ...(recipe.description === undefined ? {} : { description: recipe.description }),
    ...(card.showPrices && price !== undefined && price > 0 ? { priceRappen: price } : {}),
    ...(card.showPhotos && recipe.photo !== undefined ? { photo: recipe.photo } : {}),
    allergens: declaration.allergens.map(allergenRef),
    traces: declaration.traces.map(allergenRef),
    diet: declaration.diet,
    labels: recipe.labels.map((label) => ({ id: label, text: dishLabelText(label) })),
    origins: declaration.origins.map(originOf),
    incomplete: isIncomplete(declaration),
  };
}

export interface GuestContent {
  sections: GuestSection[];
  allergens: AllergenId[];
  traces: AllergenId[];
  diets: Diet[];
  incomplete: boolean;
}

/** The guest sections: live dishes that are active, sections without any left out. */
export function guestContent(card: MenuCard, book: MenuBook): GuestContent {
  const sections: GuestSection[] = [];
  const dishes: GuestDish[] = [];
  for (const section of card.sections) {
    const visible = section.recipeIds
      .map((recipeId) => guestDish(analyseDish(recipeId, card, book), card))
      .filter((dish): dish is GuestDish => dish !== undefined);
    if (visible.length > 0) {
      sections.push({ id: section.id, title: section.title, dishes: visible });
      dishes.push(...visible);
    }
  }
  const contained = sortAllergens(dishes.flatMap((dish) => dish.allergens.map((item) => item.id)));
  const traces = sortAllergens(dishes.flatMap((dish) => dish.traces.map((item) => item.id))).filter(
    (id) => !contained.includes(id),
  );
  return {
    sections,
    allergens: contained,
    traces,
    diets: DIET_ORDER.filter((diet) => dishes.some((dish) => dish.diet === diet)),
    incomplete: dishes.some((dish) => dish.incomplete),
  };
}

/** The matrix for the staff: every live dish on the card, active or not, against the allergens. */
export function allergenRows(card: MenuCard, book: MenuBook): AllergenSheetRow[] {
  const rows: AllergenSheetRow[] = [];
  for (const section of card.sections) {
    for (const recipeId of section.recipeIds) {
      const state = analyseDish(recipeId, card, book);
      const { recipe, declaration } = state;
      if (recipe === undefined || declaration === undefined || !state.isDish) {
        continue;
      }
      rows.push({
        id: recipe.id,
        name: recipe.name,
        section: section.title,
        active: state.active,
        diet: declaration.diet,
        origins: declaration.origins.map(originOf),
        incomplete: isIncomplete(declaration),
        cells: ALLERGENS.map((allergen) => ({
          id: allergen.id,
          state: stateOf(allergen.id, declaration),
        })),
      });
    }
  }
  return rows;
}

function stateOf(id: AllergenId, declaration: Declaration): AllergenState {
  if (declaration.allergens.includes(id)) {
    return 'contains';
  }
  return declaration.traces.includes(id) ? 'traces' : 'none';
}
