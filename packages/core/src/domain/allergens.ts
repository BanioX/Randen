import { z } from 'zod';

/**
 * The fourteen ingredients that can trigger allergies or other unwanted reactions and must be
 * named in Switzerland (LIV, SR 817.022.16, Anhang 6; docs/fakten.md section 1). The ids are
 * stable and part of the data; `label` is the short word for a badge, `official` is the wording
 * of the ordinance. The order is the order of the ordinance, so the position plus one is the
 * number the industry guideline proposes as a short code on menu cards.
 */
export const ALLERGENS = [
  {
    id: 'gluten',
    label: 'Gluten',
    official:
      'Glutenhaltiges Getreide, namentlich Weizen, Dinkel, Khorasan-Weizen, Roggen, Gerste, Hafer oder Hybridstämme davon sowie daraus gewonnene Erzeugnisse',
  },
  {
    id: 'crustaceans',
    label: 'Krebstiere',
    official: 'Krebstiere und daraus gewonnene Erzeugnisse',
  },
  { id: 'eggs', label: 'Eier', official: 'Eier und daraus gewonnene Erzeugnisse' },
  { id: 'fish', label: 'Fisch', official: 'Fische und daraus gewonnene Erzeugnisse' },
  { id: 'peanuts', label: 'Erdnüsse', official: 'Erdnüsse und daraus gewonnene Erzeugnisse' },
  { id: 'soy', label: 'Soja', official: 'Sojabohnen und daraus gewonnene Erzeugnisse' },
  {
    id: 'milk',
    label: 'Milch',
    official: 'Milch und daraus gewonnene Erzeugnisse, einschliesslich Laktose',
  },
  {
    id: 'nuts',
    label: 'Nüsse',
    official:
      'Hartschalenobst, Schalenfrüchte oder Nüsse: Mandeln, Haselnüsse, Walnüsse, Cashewnüsse, Pecannüsse, Paranüsse, Pistazien, Macadamianüsse oder Queenslandnüsse und daraus gewonnene Erzeugnisse',
  },
  { id: 'celery', label: 'Sellerie', official: 'Sellerie und daraus gewonnene Erzeugnisse' },
  { id: 'mustard', label: 'Senf', official: 'Senf und daraus gewonnene Erzeugnisse' },
  { id: 'sesame', label: 'Sesam', official: 'Sesamsamen und daraus gewonnene Erzeugnisse' },
  {
    id: 'sulphites',
    label: 'Sulfite',
    official:
      'Schwefeldioxid und Sulfite in Konzentrationen von mehr als 10 mg/kg oder 10 mg/l, ausgedrückt als SO2',
  },
  { id: 'lupin', label: 'Lupinen', official: 'Lupinen und daraus gewonnene Erzeugnisse' },
  { id: 'molluscs', label: 'Weichtiere', official: 'Weichtiere und daraus gewonnene Erzeugnisse' },
] as const;

export const AllergenIdSchema = z.enum(ALLERGENS.map((allergen) => allergen.id));
export type AllergenId = z.infer<typeof AllergenIdSchema>;
export const ALLERGEN_IDS = AllergenIdSchema.options;

const ORDER = new Map<string, number>(ALLERGENS.map((allergen, index) => [allergen.id, index]));
const BY_ID = new Map<string, (typeof ALLERGENS)[number]>(
  ALLERGENS.map((allergen) => [allergen.id, allergen]),
);

export function allergenLabel(id: AllergenId): string {
  return BY_ID.get(id)?.label ?? id;
}

export function allergenOfficial(id: AllergenId): string {
  return BY_ID.get(id)?.official ?? id;
}

/** Unique allergens in the order of the ordinance, so every list reads the same. */
export function sortAllergens(ids: Iterable<AllergenId>): AllergenId[] {
  return [...new Set(ids)].sort((a, b) => (ORDER.get(a) ?? 0) - (ORDER.get(b) ?? 0));
}

/**
 * What a dish is for a guest who avoids animal products. An ingredient is `vegan`, `vegetarian`
 * (milk, eggs, honey) or `omnivore` (meat, fish); a dish is as strict as its weakest ingredient.
 */
export const DietSchema = z.enum(['vegan', 'vegetarian', 'omnivore']);
export type Diet = z.infer<typeof DietSchema>;

const DIET_RANK: Record<Diet, number> = { vegan: 0, vegetarian: 1, omnivore: 2 };

/** The diet of a whole from the diets of its parts; nothing at all counts as vegan. */
export function combineDiets(diets: Iterable<Diet>): Diet {
  let result: Diet = 'vegan';
  for (const diet of diets) {
    if (DIET_RANK[diet] > DIET_RANK[result]) {
      result = diet;
    }
  }
  return result;
}

export function dietLabel(diet: Diet): string {
  return { vegan: 'Vegan', vegetarian: 'Vegetarisch', omnivore: 'Mit Fleisch oder Fisch' }[diet];
}
