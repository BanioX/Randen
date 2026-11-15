import { z } from 'zod';
import {
  BusinessKindSchema,
  ModuleIdSchema,
  type Business,
  type BusinessKind,
  type ModuleId,
} from '../model/business';
import { DEFAULT_VAT_BPS, VAT_RATES_CH } from './vat';

/**
 * Betriebsarten und Funktionen (ADR-0015). A kebab shop and a production kitchen share the core
 * (stock, articles, recipes, self-checks) and differ in the functions around it. Three answers
 * propose them: the kind of business, where the goods come from and how many people work in the
 * kitchen. The business then switches every function itself.
 */

/** The switchable functions in their canonical order. */
export const MODULE_IDS = ModuleIdSchema.options;

/** Where the goods come from (setup, step 2). */
export const GoodsSourcesSchema = z.object({
  /** Fetched by the kitchen itself: cash & carry, market, wholesale with pick-up. */
  pickup: z.boolean(),
  /** Delivered by suppliers. */
  delivered: z.boolean(),
  /** Orders are placed ahead with the delivering suppliers (counts only with `delivered`). */
  orders: z.boolean(),
});
export type GoodsSources = z.infer<typeof GoodsSourcesSchema>;

/** How many people work in the kitchen: decides team, places and the depth of the view. */
export const TeamSizeSchema = z.enum(['solo', 'small', 'large']);
export type TeamSize = z.infer<typeof TeamSizeSchema>;

/** Where guests mostly eat: decides the VAT a new dish proposes (docs/fakten.md section 3). */
export const EatingSchema = z.enum(['here', 'away']);
export type Eating = z.infer<typeof EatingSchema>;

/** The answers of «Randen einrichten». */
export const SetupAnswersSchema = z.object({
  kind: BusinessKindSchema,
  sources: GoodsSourcesSchema,
  team: TeamSizeSchema,
  eating: EatingSchema.optional(),
});
export type SetupAnswers = z.infer<typeof SetupAnswersSchema>;

/** The kinds in the order the setup shows them: from the counter to the production kitchen. */
export const BUSINESS_KINDS: readonly BusinessKind[] = [
  'takeaway',
  'cafe',
  'bistro',
  'restaurant',
  'lunch',
  'bakery',
  'hotel',
  'catering',
  'canteen',
  'mensa',
  'care',
  'school',
  'central_kitchen',
  'other',
];

interface KindProfile {
  label: string;
  /**
   * The functions of the trade, without those the answers decide: ordering and market (where
   * the goods come from) and team (how many people work).
   */
  modules: readonly ModuleId[];
  /** The usual answer to «Woher kommt deine Ware?», proposed in the setup. */
  sources: GoodsSources;
  /** Whether a kitchen of this kind with a team starts with the detailed view (ADR-0014). */
  detailed: boolean;
  /** Whether the setup asks where guests eat: only where take-away is common. */
  asksEating: boolean;
}

const PICKUP: GoodsSources = { pickup: true, delivered: false, orders: false };
const BOTH: GoodsSources = { pickup: true, delivered: true, orders: true };
const ORDERED: GoodsSources = { pickup: false, delivered: true, orders: true };
const BROUGHT: GoodsSources = { pickup: true, delivered: true, orders: false };

const PROFILES: Record<BusinessKind, KindProfile> = {
  takeaway: {
    label: 'Imbiss und Take-away',
    modules: ['menu_card'],
    sources: PICKUP,
    detailed: false,
    asksEating: true,
  },
  cafe: {
    label: 'Café und Bar',
    modules: ['menu_card'],
    sources: BROUGHT,
    detailed: false,
    asksEating: true,
  },
  bistro: {
    label: 'Bistro und Beiz',
    modules: ['menu_card', 'production'],
    sources: BOTH,
    detailed: false,
    asksEating: false,
  },
  restaurant: {
    label: 'Restaurant',
    modules: ['menu_card', 'production', 'sales', 'numbers', 'places'],
    sources: ORDERED,
    detailed: true,
    asksEating: false,
  },
  lunch: {
    label: 'Tagesrestaurant',
    modules: ['menu_card', 'production', 'planning', 'meals', 'numbers'],
    sources: BOTH,
    detailed: false,
    asksEating: false,
  },
  bakery: {
    label: 'Bäckerei und Konditorei',
    modules: ['menu_card', 'production', 'sales'],
    sources: BOTH,
    detailed: false,
    asksEating: true,
  },
  hotel: {
    label: 'Hotel',
    modules: ['menu_card', 'production', 'planning', 'meals', 'sales', 'numbers', 'places'],
    sources: ORDERED,
    detailed: true,
    asksEating: false,
  },
  catering: {
    label: 'Catering und Events',
    modules: ['menu_card', 'production', 'planning', 'dispatch', 'numbers', 'places'],
    sources: BOTH,
    detailed: true,
    asksEating: false,
  },
  canteen: {
    label: 'Personalrestaurant und Kantine',
    modules: ['menu_card', 'production', 'planning', 'meals', 'sales', 'numbers', 'places'],
    sources: ORDERED,
    detailed: true,
    asksEating: false,
  },
  mensa: {
    label: 'Mensa',
    modules: ['menu_card', 'production', 'planning', 'meals', 'sales', 'numbers', 'places'],
    sources: ORDERED,
    detailed: true,
    asksEating: false,
  },
  care: {
    label: 'Spital und Heim',
    modules: ['menu_card', 'production', 'planning', 'meals', 'numbers', 'places'],
    sources: ORDERED,
    detailed: true,
    asksEating: false,
  },
  school: {
    label: 'Kita, Schule und Mittagstisch',
    modules: ['planning', 'meals'],
    sources: BROUGHT,
    detailed: false,
    asksEating: false,
  },
  central_kitchen: {
    label: 'Produktionsküche',
    modules: ['production', 'planning', 'dispatch', 'numbers', 'places'],
    sources: ORDERED,
    detailed: true,
    asksEating: false,
  },
  other: {
    label: 'Anderer Betrieb',
    modules: MODULE_IDS,
    sources: BOTH,
    detailed: true,
    asksEating: false,
  },
};

/**
 * What a business works with before it went through «Randen einrichten», on a device that
 * shows the essentials: the menu card and the order proposal, as in ADR-0014.
 */
export const STARTER_MODULES: readonly ModuleId[] = ['menu_card', 'ordering'];

/** A function that only works with another: switching it on switches the other on too. */
export const MODULE_REQUIRES: Readonly<Partial<Record<ModuleId, readonly ModuleId[]>>> = {
  // Deliveries to satellites send what production made, with its lot.
  dispatch: ['production'],
};

export function businessKindLabel(kind: BusinessKind): string {
  return PROFILES[kind].label;
}

/** The answer to «Woher kommt deine Ware?» the setup proposes for a kind. */
export function suggestedSources(kind: BusinessKind): GoodsSources {
  return PROFILES[kind].sources;
}

/** Whether the setup asks «Essen deine Gäste meist hier oder nehmen sie es mit?». */
export function asksWhereGuestsEat(kind: BusinessKind): boolean {
  return PROFILES[kind].asksEating;
}

/** Modules once each, in the canonical order, so two equal choices compare equal. */
export function orderModules(modules: Iterable<ModuleId>): ModuleId[] {
  const set = new Set(modules);
  return MODULE_IDS.filter((id) => set.has(id));
}

/** Adds what the chosen functions need (MODULE_REQUIRES), in the canonical order. */
export function withRequirements(modules: Iterable<ModuleId>): ModuleId[] {
  const set = new Set(modules);
  for (const id of [...set]) {
    for (const required of MODULE_REQUIRES[id] ?? []) {
      set.add(required);
    }
  }
  return orderModules(set);
}

/**
 * One switch on «Betrieb › Funktionen»: on brings what the function needs, off also switches
 * off what needs it, so the list never holds a function without its base.
 */
export function switchModule(modules: Iterable<ModuleId>, id: ModuleId, on: boolean): ModuleId[] {
  const set = new Set(modules);
  if (on) {
    set.add(id);
    return withRequirements(set);
  }
  set.delete(id);
  for (const dependent of MODULE_IDS) {
    if (MODULE_REQUIRES[dependent]?.includes(id) === true) {
      set.delete(dependent);
    }
  }
  return orderModules(set);
}

export interface SetupProposal {
  modules: ModuleId[];
  /** The view a device starts with (ADR-0014): «Erweitert» or the essentials. */
  detailed: boolean;
  /** The VAT new dishes propose, when the answers decide it. */
  defaultVatBps?: number;
}

const REDUCED_VAT_BPS = VAT_RATES_CH.find((rate) => rate.id === 'reduced')?.bps ?? 260;

/**
 * What the answers of the setup propose. The kind gives the functions of its trade; the goods
 * decide the market and ordering; the team decides team, places and the view: a cook alone
 * needs no team and no tour, a brigade of more than ten gets both and the detailed view.
 */
export function proposeSetup(answers: SetupAnswers): SetupProposal {
  const profile = PROFILES[answers.kind];
  const modules = new Set<ModuleId>(profile.modules);
  const { pickup, delivered, orders } = answers.sources;
  for (const decided of ['market', 'ordering', 'team'] as const) {
    modules.delete(decided);
  }
  if (pickup) modules.add('market');
  if (delivered && orders) modules.add('ordering');
  if (answers.team === 'solo') {
    modules.delete('places');
  } else {
    modules.add('team');
  }
  if (answers.team === 'large') {
    modules.add('places');
  }
  const eating = profile.asksEating ? answers.eating : undefined;
  return {
    modules: withRequirements(modules),
    detailed: answers.team === 'large' || (profile.detailed && answers.team !== 'solo'),
    ...(eating === undefined
      ? {}
      : { defaultVatBps: eating === 'away' ? REDUCED_VAT_BPS : DEFAULT_VAT_BPS }),
  };
}

/**
 * The functions a business works with on a device. A business that went through the setup or
 * switched a function has its list. One from before has none: then the device's view decides,
 * as in ADR-0014: «Erweitert» shows everything, the essentials show STARTER_MODULES. So nobody
 * loses a function they used, and a new business is not overwhelmed before its setup.
 */
export function modulesInUse(business: Pick<Business, 'modules'>, detailed: boolean): ModuleId[] {
  if (business.modules !== undefined) {
    return orderModules(business.modules);
  }
  return detailed ? [...MODULE_IDS] : [...STARTER_MODULES];
}

/** For the core, without a device: a business without a list has every function. */
export function hasModule(business: Pick<Business, 'modules'>, id: ModuleId): boolean {
  return business.modules === undefined || business.modules.includes(id);
}
