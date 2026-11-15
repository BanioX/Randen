import { z } from 'zod';
import {
  command,
  commandBase,
  query,
  queryBase,
  type ContractFragment,
} from '../../contract/operation';
import { AllergenIdSchema, DietSchema } from '../../domain/allergens';
import { IdSchema } from '../../ids';
import { RappenSchema } from '../../money';
import { MenuCardSchema, MenuSectionSchema } from '../../model/menu';
import { CourseSchema, DishLabelSchema } from '../../model/recipe';
import { CountryCodeSchema, PhotoSchema } from '../../model/primitives';

/** One card in the list of «Speisekarte»: the numbers a row shows, joined already. */
export const MenuCardSummarySchema = z.object({
  id: IdSchema,
  name: z.string(),
  published: z.boolean(),
  sectionCount: z.int(),
  dishCount: z.int(),
  /** Every open point of every dish: a price, a photo, an origin, a declaration. */
  problems: z.int(),
});
export type MenuCardSummary = z.infer<typeof MenuCardSummarySchema>;

/** A dish in the editor: what the card shows, and what is still missing, as words. */
export const MenuDishRowSchema = z.object({
  id: IdSchema,
  name: z.string(),
  course: CourseSchema,
  priceRappen: RappenSchema.optional(),
  hasPhoto: z.boolean(),
  /** The thumbnail of the editor; the guest view gets it only when the card shows photos. */
  photo: PhotoSchema.optional(),
  active: z.boolean(),
  problems: z.array(z.string()),
});
export type MenuDishRow = z.infer<typeof MenuDishRowSchema>;

export const MenuEditorSectionSchema = z.object({
  id: IdSchema,
  title: z.string(),
  dishes: z.array(MenuDishRowSchema),
});
export type MenuEditorSection = z.infer<typeof MenuEditorSectionSchema>;

/** The card itself, as the editor and the guest view read it. */
export const MenuCardViewSchema = z.object({
  id: IdSchema,
  name: z.string(),
  intro: z.string().optional(),
  footer: z.string().optional(),
  showPrices: z.boolean(),
  showPhotos: z.boolean(),
  published: z.boolean(),
});
export type MenuCardView = z.infer<typeof MenuCardViewSchema>;

/** One allergen with its short label and the wording of the ordinance (LIV Anhang 6). */
export const AllergenRefSchema = z.object({
  id: AllergenIdSchema,
  label: z.string(),
  official: z.string(),
});
export type AllergenRef = z.infer<typeof AllergenRefSchema>;

/** Meat or fish of a dish and where it comes from; without a country the origin is missing. */
export const DishOriginSchema = z.object({
  name: z.string(),
  country: CountryCodeSchema.optional(),
  countryName: z.string().optional(),
});
export type DishOrigin = z.infer<typeof DishOriginSchema>;

/** A dish as a guest reads it: only what the card is set to show, and what the guest may know. */
export const GuestDishSchema = z.object({
  id: IdSchema,
  name: z.string(),
  description: z.string().optional(),
  priceRappen: RappenSchema.optional(),
  photo: PhotoSchema.optional(),
  allergens: z.array(AllergenRefSchema),
  traces: z.array(AllergenRefSchema),
  diet: DietSchema,
  labels: z.array(z.object({ id: DishLabelSchema, text: z.string() })),
  origins: z.array(DishOriginSchema),
  /** The declaration is not complete: the guest is asked to ask the staff. */
  incomplete: z.boolean(),
});
export type GuestDish = z.infer<typeof GuestDishSchema>;

export const GuestSectionSchema = z.object({
  id: IdSchema,
  title: z.string(),
  dishes: z.array(GuestDishSchema),
});
export type GuestSection = z.infer<typeof GuestSectionSchema>;

/** One cell of the allergen matrix: contained, possible as traces, or none. */
export const AllergenStateSchema = z.enum(['contains', 'traces', 'none']);
export type AllergenState = z.infer<typeof AllergenStateSchema>;

export const AllergenSheetRowSchema = z.object({
  id: IdSchema,
  name: z.string(),
  section: z.string(),
  active: z.boolean(),
  diet: DietSchema,
  origins: z.array(DishOriginSchema),
  incomplete: z.boolean(),
  /** The fourteen allergens in the order of the ordinance. */
  cells: z.array(z.object({ id: AllergenIdSchema, state: AllergenStateSchema })),
});
export type AllergenSheetRow = z.infer<typeof AllergenSheetRowSchema>;

/** The command results: the id of the card they touched. */
export const MenuCommandResultSchema = z.object({ cardId: IdSchema });

/** Name, intro and footer as a person types them: trimmed, a cleared field is left out. */
const introSchema = z.string().trim().max(400);
const footerSchema = z.string().trim().max(600);

export const menuContract = {
  'menu.list': query({
    name: 'menu.list',
    summary: {
      de: 'Die Speisekarten mit Abschnitten, Gerichten, Veröffentlichung und offenen Punkten.',
      en: 'The menu cards with sections, dishes, publication and open points.',
    },
    scopes: ['menu:read'],
    input: z.object({ ...queryBase }),
    output: z.object({ cards: z.array(MenuCardSummarySchema) }),
  }),
  'menu.get': query({
    name: 'menu.get',
    summary: {
      de: 'Eine Speisekarte für den Editor: Abschnitte, Gerichte und was noch fehlt.',
      en: 'One menu card for the editor: sections, dishes and what is missing.',
    },
    scopes: ['menu:read'],
    input: z.object({ ...queryBase, cardId: IdSchema }),
    output: z.object({
      card: MenuCardViewSchema,
      sections: z.array(MenuEditorSectionSchema),
      /** Every dish with an open point, with the points as words: the notice before publishing. */
      problems: z.array(
        z.object({ dishId: IdSchema, name: z.string(), problems: z.array(z.string()) }),
      ),
      problemCount: z.int(),
    }),
  }),
  'menu.published': query({
    name: 'menu.published',
    summary: {
      de: 'Die veröffentlichten Speisekarten, für den Eingang zur Gästeansicht.',
      en: 'The published menu cards, for the entry to the guest view.',
    },
    scopes: ['menu:read'],
    input: z.object({ ...queryBase }),
    output: z.object({ cards: z.array(z.object({ id: IdSchema, name: z.string() })) }),
  }),
  'menu.guest': query({
    name: 'menu.guest',
    summary: {
      de: 'Eine Speisekarte, wie der Gast sie sieht; ohne Vorschau nur veröffentlichte Karten.',
      en: 'A menu card as a guest sees it; without preview only published cards.',
    },
    scopes: ['menu:read'],
    input: z.object({ ...queryBase, cardId: IdSchema, preview: z.boolean().default(false) }),
    output: z.object({
      businessName: z.string(),
      card: MenuCardViewSchema,
      sections: z.array(GuestSectionSchema),
      /** The allergens and traces that occur on this card, for the filter. */
      allergens: z.array(AllergenIdSchema),
      traces: z.array(AllergenIdSchema),
      diets: z.array(DietSchema),
      incomplete: z.boolean(),
      preview: z.boolean(),
    }),
  }),
  'menu.allergenSheet': query({
    name: 'menu.allergenSheet',
    summary: {
      de: 'Die Allergenliste für das Personal: Gerichte gegen die vierzehn Allergene.',
      en: 'The allergen list for the staff: dishes against the fourteen allergens.',
    },
    scopes: ['menu:read'],
    input: z.object({ ...queryBase, cardId: IdSchema }),
    output: z.object({
      businessName: z.string(),
      card: MenuCardViewSchema,
      allergens: z.array(AllergenRefSchema),
      rows: z.array(AllergenSheetRowSchema),
    }),
  }),
  'menu.export': query({
    name: 'menu.export',
    summary: {
      de: 'Die Gästeansicht als eine HTML-Datei, die ohne Randen geöffnet werden kann.',
      en: 'The guest view as one HTML file that opens without Randen.',
    },
    scopes: ['menu:read'],
    input: z.object({ ...queryBase, cardId: IdSchema }),
    output: z.object({ fileName: z.string(), html: z.string() }),
  }),
  'menu.create': command({
    name: 'menu.create',
    summary: {
      de: 'Eine leere Speisekarte anlegen, als Entwurf.',
      en: 'Create an empty menu card, as a draft.',
    },
    scopes: ['menu:write'],
    input: z.object({
      ...commandBase,
      name: MenuCardSchema.shape.name,
      intro: introSchema.optional(),
      footer: footerSchema.optional(),
      showPrices: z.boolean().default(true),
      showPhotos: z.boolean().default(true),
    }),
    output: MenuCommandResultSchema,
  }),
  'menu.update': command({
    name: 'menu.update',
    summary: {
      de: 'Name, Einleitung, Schluss und die Schalter «Preise zeigen» und «Fotos zeigen» ändern.',
      en: 'Change name, intro, footer and the switches for prices and photos.',
    },
    scopes: ['menu:write'],
    input: z.object({
      ...commandBase,
      cardId: IdSchema,
      name: MenuCardSchema.shape.name.optional(),
      intro: introSchema.optional(),
      footer: footerSchema.optional(),
      showPrices: z.boolean().optional(),
      showPhotos: z.boolean().optional(),
    }),
    output: MenuCommandResultSchema,
  }),
  'menu.setPublished': command({
    name: 'menu.setPublished',
    summary: {
      de: 'Eine Speisekarte veröffentlichen oder zurück auf Entwurf setzen.',
      en: 'Publish a menu card or set it back to draft.',
    },
    scopes: ['menu:write'],
    input: z.object({ ...commandBase, cardId: IdSchema, published: z.boolean() }),
    output: MenuCommandResultSchema,
  }),
  'menu.setSections': command({
    name: 'menu.setSections',
    summary: {
      de: 'Alle Abschnitte einer Speisekarte mit ihren Gerichten in der Reihenfolge setzen.',
      en: 'Set all sections of a menu card with their dishes in order.',
    },
    scopes: ['menu:write'],
    input: z.object({
      ...commandBase,
      cardId: IdSchema,
      sections: z
        .array(
          z.object({
            /** Missing for a new section; a known id keeps the section. */
            id: MenuSectionSchema.shape.id.optional(),
            title: MenuSectionSchema.shape.title,
            recipeIds: MenuSectionSchema.shape.recipeIds,
          }),
        )
        .max(20),
    }),
    output: MenuCommandResultSchema,
  }),
  'menu.duplicate': command({
    name: 'menu.duplicate',
    summary: {
      de: 'Eine Speisekarte kopieren, als «… (Kopie)» und als Entwurf.',
      en: 'Copy a menu card as «… (Kopie)», as a draft.',
    },
    scopes: ['menu:write'],
    input: z.object({ ...commandBase, cardId: IdSchema }),
    output: MenuCommandResultSchema.extend({ name: z.string() }),
  }),
  'menu.delete': command({
    name: 'menu.delete',
    summary: {
      de: 'Eine Speisekarte löschen; die Gerichte und Rezepte bleiben.',
      en: 'Delete a menu card; its dishes and recipes stay.',
    },
    scopes: ['menu:write'],
    input: z.object({ ...commandBase, cardId: IdSchema }),
    output: MenuCommandResultSchema,
  }),
} as const satisfies ContractFragment;
