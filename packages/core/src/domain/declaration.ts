import type { Id } from '../ids';
import type { ArticleKind } from '../model/article';
import type { CountryCode } from '../model/primitives';
import { combineDiets, sortAllergens, type AllergenId, type Diet } from './allergens';
import { articleCategory, type ArticleCategoryId } from './categories';

/** What a declaration needs to know about an article. */
export interface DeclaredArticle {
  id: Id;
  name: string;
  kind: ArticleKind;
  categoryId: ArticleCategoryId;
  allergens: readonly AllergenId[];
  traces: readonly AllergenId[];
  diet: Diet;
  originCountry?: CountryCode | undefined;
  recipeId?: Id | undefined;
}

/** What a declaration needs to know about a recipe. */
export interface DeclaredRecipe {
  id: Id;
  ingredients: readonly { articleId: Id }[];
  extraAllergens: readonly AllergenId[];
  extraTraces: readonly AllergenId[];
}

export interface DeclarationBook {
  articles: ReadonlyMap<Id, DeclaredArticle>;
  recipes: ReadonlyMap<Id, DeclaredRecipe>;
}

export interface OriginLine {
  articleId: Id;
  name: string;
  categoryId: ArticleCategoryId;
  /** Undefined: the origin is not on file yet and has to be completed before the dish is sold. */
  country: CountryCode | undefined;
}

export interface Declaration {
  /** Contained allergens, in the order of the ordinance. */
  allergens: AllergenId[];
  /** Possible traces that are not already contained. */
  traces: AllergenId[];
  diet: Diet;
  /** Meat and fish with their country of origin. */
  origins: OriginLine[];
  /**
   * True when an ingredient is unknown (deleted article, recipe that contains itself). The
   * declaration may then miss something and must not be shown as complete.
   */
  incomplete: boolean;
}

/**
 * What a dish has to declare, derived from its ingredients all the way down through the
 * components made in house. Nothing is typed twice: change an article and every dish follows.
 */
export function declarationOf(recipe: DeclaredRecipe, book: DeclarationBook): Declaration {
  const allergens = new Set<AllergenId>(recipe.extraAllergens);
  const traces = new Set<AllergenId>(recipe.extraTraces);
  const diets: Diet[] = [];
  const origins = new Map<Id, OriginLine>();
  let incomplete = false;

  const visit = (current: DeclaredRecipe, seen: ReadonlySet<Id>) => {
    for (const { articleId } of current.ingredients) {
      const article = book.articles.get(articleId);
      if (article === undefined) {
        incomplete = true;
        continue;
      }
      article.allergens.forEach((id) => allergens.add(id));
      article.traces.forEach((id) => traces.add(id));
      const sub =
        article.kind === 'prepared' && article.recipeId !== undefined
          ? book.recipes.get(article.recipeId)
          : undefined;
      if (sub !== undefined) {
        if (seen.has(sub.id)) {
          incomplete = true;
        } else {
          sub.extraAllergens.forEach((id) => allergens.add(id));
          sub.extraTraces.forEach((id) => traces.add(id));
          visit(sub, new Set([...seen, sub.id]));
        }
        continue;
      }
      if (article.kind === 'prepared') {
        // A component without a recipe: trust what is stored on the article.
        diets.push(article.diet);
        continue;
      }
      diets.push(article.diet);
      if (articleCategory(article.categoryId).declaresOrigin) {
        origins.set(article.id, {
          articleId: article.id,
          name: article.name,
          categoryId: article.categoryId,
          country: article.originCountry,
        });
      }
    }
  };
  visit(recipe, new Set([recipe.id]));

  const contained = sortAllergens(allergens);
  return {
    allergens: contained,
    traces: sortAllergens(traces).filter((id) => !contained.includes(id)),
    diet: combineDiets(diets),
    origins: [...origins.values()].sort((a, b) => a.name.localeCompare(b.name, 'de-CH')),
    incomplete,
  };
}

const COUNTRY_NAMES: Readonly<Record<string, string>> = {
  CH: 'Schweiz',
  DE: 'Deutschland',
  AT: 'Österreich',
  FR: 'Frankreich',
  IT: 'Italien',
  ES: 'Spanien',
  PT: 'Portugal',
  NL: 'Niederlande',
  BE: 'Belgien',
  DK: 'Dänemark',
  NO: 'Norwegen',
  SE: 'Schweden',
  FI: 'Finnland',
  IS: 'Island',
  IE: 'Irland',
  GB: 'Grossbritannien',
  PL: 'Polen',
  HU: 'Ungarn',
  GR: 'Griechenland',
  TR: 'Türkei',
  US: 'USA',
  CA: 'Kanada',
  BR: 'Brasilien',
  AR: 'Argentinien',
  UY: 'Uruguay',
  PY: 'Paraguay',
  CL: 'Chile',
  AU: 'Australien',
  NZ: 'Neuseeland',
  VN: 'Vietnam',
  TH: 'Thailand',
  CN: 'China',
  JP: 'Japan',
  IN: 'Indien',
  ZA: 'Südafrika',
  MA: 'Marokko',
  EC: 'Ecuador',
  PE: 'Peru',
};

/** The German name of a country of origin; the code itself when it is not in the list. */
export function countryName(code: string): string {
  return COUNTRY_NAMES[code] ?? code;
}

/** Countries offered in the origin picker, Switzerland first, then by name. */
export const ORIGIN_COUNTRIES: readonly { code: string; name: string }[] = Object.entries(
  COUNTRY_NAMES,
)
  .map(([code, name]) => ({ code, name }))
  .sort((a, b) =>
    a.code === 'CH' ? -1 : b.code === 'CH' ? 1 : a.name.localeCompare(b.name, 'de-CH'),
  );
