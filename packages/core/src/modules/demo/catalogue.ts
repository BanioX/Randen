import type { AllergenId, Diet } from '../../domain/allergens';
import type { AreaKind, ArticleCategoryId } from '../../domain/categories';
import type { StaffRole } from '../../model/business';
import type { TaskFrequency } from '../../model/haccp';
import type { PlanSlot } from '../../model/menu';
import type { CountryCode, DateKind, Unit, Weekday } from '../../model/primitives';
import type { ReceiptAmountKind } from '../../model/stock';
import type { Course, DishLabel } from '../../model/recipe';
import type { DishPicture, SpotPicture } from './photos';

/**
 * The «Bistro Beispiel» as data: what the demo writes, before any id exists. Everything is
 * invented: names of people and suppliers, and every price. The prices are plausible Swiss
 * wholesale prices of 2026 (Beispielwerte), in Rappen per 1000 base units: per kg, per litre
 * or per 1000 pieces (ADR-0004). They are the prices of today; the history derives older ones.
 */

export type AreaKey = 'cold' | 'frozen' | 'dry' | 'bar' | 'station';

export interface SpotDef {
  key: string;
  name: string;
  note?: string;
  picture: SpotPicture;
}

export interface AreaDef {
  key: AreaKey;
  name: string;
  kind: AreaKind;
  minDeciC?: number;
  maxDeciC?: number;
  /** Measured twice a day for the self-control. */
  measured: boolean;
  spots: readonly SpotDef[];
}

export const AREAS: readonly AreaDef[] = [
  {
    key: 'cold',
    name: 'Kühlzelle',
    kind: 'cold',
    minDeciC: 0,
    maxDeciC: 50,
    measured: true,
    spots: [
      {
        key: 'cold-meat',
        name: 'Regal 1, Fleisch und Geflügel',
        note: 'Rohes Fleisch immer zuunterst, getrennt von Fertigem.',
        picture: { kind: 'shelf', wall: 'steel', goods: 'meat' },
      },
      {
        key: 'cold-fish',
        name: 'Schublade Fisch',
        note: 'Fisch auf Eis, Schublade jeden Abend auswischen.',
        picture: { kind: 'drawer', goods: 'fish' },
      },
      {
        key: 'cold-dairy',
        name: 'Regal 2, Milchprodukte und Fonds',
        note: 'Eigenproduktion beschriftet mit Datum, oben rechts.',
        picture: { kind: 'shelf', wall: 'steel', goods: 'dairy' },
      },
      {
        key: 'cold-veg',
        name: 'Gemüsekisten',
        picture: { kind: 'crates', goods: 'vegetables' },
      },
    ],
  },
  {
    key: 'frozen',
    name: 'Tiefkühlzelle',
    kind: 'frozen',
    maxDeciC: -180,
    measured: true,
    spots: [
      {
        key: 'frozen-shelf',
        name: 'Regal TK 1, Gemüse und Pilze',
        picture: { kind: 'freezer' },
      },
      {
        key: 'frozen-chest',
        name: 'Truhe Glace',
        note: 'Glace mit dem Portionierer aus der Truhe, Deckel gleich wieder zu.',
        picture: { kind: 'chest' },
      },
    ],
  },
  {
    key: 'dry',
    name: 'Trockenlager',
    kind: 'dry',
    measured: false,
    spots: [
      {
        key: 'dry-flour',
        name: 'Regal 1, Mehl, Reis und Teigwaren',
        picture: { kind: 'shelf', wall: 'wall', goods: 'dry' },
      },
      {
        key: 'dry-oil',
        name: 'Regal 2, Öle, Essig und Konserven',
        picture: { kind: 'shelf', wall: 'wall', goods: 'oil' },
      },
      {
        key: 'dry-crates',
        name: 'Kisten Kartoffeln und Zwiebeln',
        note: 'Dunkel und kühl, nicht neben das Obst.',
        picture: { kind: 'crates', goods: 'potatoes' },
      },
      {
        key: 'dry-bread',
        name: 'Brotregal',
        picture: { kind: 'bread' },
      },
    ],
  },
  {
    key: 'bar',
    name: 'Bar und Weinkeller',
    kind: 'bar',
    measured: false,
    spots: [
      {
        key: 'bar-red',
        name: 'Weinregal links, Rotwein',
        picture: { kind: 'wine', colour: 'red' },
      },
      {
        key: 'bar-white',
        name: 'Weinregal rechts, Weisswein',
        picture: { kind: 'wine', colour: 'white' },
      },
    ],
  },
  {
    key: 'station',
    name: 'Posten Garde-manger',
    kind: 'station',
    minDeciC: 0,
    maxDeciC: 50,
    measured: true,
    spots: [
      {
        key: 'station-dressings',
        name: 'Kühlschublade 1, Dressings',
        picture: { kind: 'drawer', goods: 'dressings' },
      },
      {
        key: 'station-garnish',
        name: 'Kühlschublade 2, Käse und Garnituren',
        picture: { kind: 'drawer', goods: 'cheese' },
      },
    ],
  },
];

export type SupplierKey =
  'butcher' | 'fishmonger' | 'farm' | 'wholesale' | 'drinks' | 'bakery' | 'market';

export interface SupplierDef {
  key: SupplierKey;
  name: string;
  /** At a market the number of the customer card («Kundenkarte»). */
  customerNumber: string;
  /** A market has no order mail. */
  email?: string;
  orderDays: readonly Weekday[];
  deliveryDays: readonly Weekday[];
  minOrderRappen?: number;
  /** Lines of a delivery note are cooled: the temperature is checked at the door. */
  chilled: boolean;
  /** Who usually takes the delivery. */
  receiver: StaffKey;
  /** A market is where the kitchen fetches goods itself (ADR-0015). */
  kind?: 'market';
  /** A market: the groups of goods in the order of the walk through its halls. */
  categoryOrder?: readonly ArticleCategoryId[];
}

const ALL_DAYS: readonly Weekday[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

/** The walk through the halls of Markt Nord: fresh produce first, then dairy and meat, dry goods, drinks, non-food, packaging. */
const MARKET_WALK: readonly ArticleCategoryId[] = [
  'vegetables',
  'fruit',
  'herbs',
  'dairy',
  'cheese',
  'eggs',
  'meat',
  'poultry',
  'charcuterie',
  'fish',
  'bakery',
  'dry',
  'canned',
  'sauces',
  'oils',
  'sweets',
  'frozen',
  'coffee_tea',
  'softdrinks',
  'wine',
  'beer',
  'spirits',
  'nonfood',
  'packaging',
  'other',
];

/** Invented suppliers; the addresses use the reserved domain `.example`. */
export const SUPPLIERS: readonly SupplierDef[] = [
  {
    key: 'butcher',
    name: 'Metzgerei Muster',
    customerNumber: 'K-10442',
    email: 'bestellung@metzgerei-muster.example',
    orderDays: ['mon', 'thu'],
    deliveryDays: ['tue', 'fri'],
    minOrderRappen: 15_000,
    chilled: true,
    receiver: 'noah',
  },
  {
    key: 'fishmonger',
    name: 'Comestibles Beispiel',
    customerNumber: '20-3318',
    email: 'kueche@comestibles-beispiel.example',
    orderDays: ['tue', 'fri'],
    deliveryDays: ['wed', 'sat'],
    minOrderRappen: 10_000,
    chilled: true,
    receiver: 'luca',
  },
  {
    key: 'farm',
    name: 'Gemüsehof Probe',
    customerNumber: 'GP-0815',
    email: 'hof@gemuesehof-probe.example',
    orderDays: ['sun', 'wed'],
    deliveryDays: ['mon', 'thu'],
    minOrderRappen: 8000,
    chilled: false,
    receiver: 'noah',
  },
  {
    key: 'wholesale',
    name: 'Grosshandel Modell',
    customerNumber: '771 204',
    email: 'gastro@grosshandel-modell.example',
    orderDays: ['mon', 'thu'],
    deliveryDays: ['tue', 'fri'],
    minOrderRappen: 30_000,
    chilled: true,
    receiver: 'noah',
  },
  {
    key: 'drinks',
    name: 'Getränke Demo',
    customerNumber: 'D-5521',
    email: 'service@getraenke-demo.example',
    orderDays: ['mon'],
    deliveryDays: ['wed'],
    chilled: false,
    receiver: 'luca',
  },
  {
    key: 'bakery',
    name: 'Bäckerei Vorlage',
    customerNumber: 'B-17',
    email: 'backstube@baeckerei-vorlage.example',
    orderDays: ALL_DAYS,
    deliveryDays: ALL_DAYS,
    chilled: false,
    receiver: 'luca',
  },
  {
    // Invented cash & carry: the kitchen fetches its goods itself, pays at the till and keeps
    // the receipt (ADR-0015). It has no order or delivery days.
    key: 'market',
    name: 'Markt Nord',
    kind: 'market',
    customerNumber: 'KK 4471 082',
    orderDays: [],
    deliveryDays: [],
    chilled: false,
    receiver: 'noah',
    categoryOrder: MARKET_WALK,
  },
];

export type StaffKey = 'mara' | 'luca' | 'ines' | 'noah';

export const STAFF: readonly { key: StaffKey; name: string; role: StaffRole }[] = [
  { key: 'mara', name: 'Mara', role: 'chef' },
  { key: 'luca', name: 'Luca', role: 'cook' },
  { key: 'ines', name: 'Ines', role: 'service' },
  { key: 'noah', name: 'Noah', role: 'purchasing' },
];

export interface ArticleDef {
  key: string;
  name: string;
  category: ArticleCategoryId;
  unit: Unit;
  /** Today's price, Rappen per 1000 base units; 0 for components (their cost follows). */
  price: number;
  yieldBps?: number;
  allergens?: readonly AllergenId[];
  traces?: readonly AllergenId[];
  diet: Diet;
  supplier?: SupplierKey;
  area: AreaKey;
  spot?: string;
  /** Order unit in base units and its name. */
  pack?: readonly [number, string];
  minStock?: number;
  targetStock?: number;
  shelfLifeDays?: number;
  dateKind: DateKind;
  origin?: CountryCode;
  /** A component: the recipe that makes it. */
  recipe?: string;
  /** Goods that keep for months: the stock today, from which the history is planned back. */
  finalStock?: number;
  /** No delivery in the last days: the reason it is below its minimum today. */
  quietDays?: number;
  /** How fresh goods are ordered when there is no pack: half kilos, whole litres. */
  step?: number;
  /** A price change on a day before today, in basis points (800 = 8 % dearer since then). */
  priceChange?: { day: number; bps: number };
  /** Fresh goods: the price moves a little from week to week, up to this many basis points. */
  swingBps?: number;
  /** Goods without a date on the pack (wine). */
  noDate?: boolean;
}

/**
 * About fifty articles of a bistro kitchen. Yields are Richtwerte (docs/fakten.md section 8),
 * shelf lives the usual proposals of the categories, allergens what the goods contain.
 */
export const ARTICLES: readonly ArticleDef[] = [
  // Fleisch und Geflügel (Metzgerei Muster), Herkunft Schweiz
  {
    key: 'entrecote',
    name: 'Rindsentrecôte',
    category: 'meat',
    unit: 'g',
    price: 6450,
    yieldBps: 9500,
    diet: 'omnivore',
    supplier: 'butcher',
    area: 'cold',
    spot: 'cold-meat',
    shelfLifeDays: 5,
    dateKind: 'use_by',
    origin: 'CH',
    step: 500,
    priceChange: { day: -10, bps: 400 },
  },
  {
    key: 'veal',
    name: 'Kalbfleisch, geschnetzelt',
    category: 'meat',
    unit: 'g',
    price: 5650,
    diet: 'omnivore',
    supplier: 'butcher',
    area: 'cold',
    spot: 'cold-meat',
    shelfLifeDays: 4,
    dateKind: 'use_by',
    origin: 'CH',
    step: 500,
  },
  {
    key: 'chicken',
    name: 'Pouletbrust',
    category: 'poultry',
    unit: 'g',
    price: 3480,
    diet: 'omnivore',
    supplier: 'butcher',
    area: 'cold',
    spot: 'cold-meat',
    shelfLifeDays: 4,
    dateKind: 'use_by',
    origin: 'CH',
    step: 500,
  },
  {
    key: 'bones',
    name: 'Kalbsknochen',
    category: 'meat',
    unit: 'g',
    price: 420,
    diet: 'omnivore',
    supplier: 'butcher',
    area: 'cold',
    spot: 'cold-meat',
    shelfLifeDays: 3,
    dateKind: 'use_by',
    origin: 'CH',
    step: 1000,
  },
  {
    key: 'bacon',
    name: 'Speckwürfel',
    category: 'charcuterie',
    unit: 'g',
    price: 2350,
    diet: 'omnivore',
    supplier: 'butcher',
    area: 'cold',
    spot: 'cold-meat',
    shelfLifeDays: 14,
    dateKind: 'use_by',
    origin: 'CH',
    pack: [500, 'Beutel à 500 g'],
  },
  // Fisch (Comestibles Beispiel)
  {
    key: 'salmon',
    name: 'Lachsfilet',
    category: 'fish',
    unit: 'g',
    price: 3690,
    yieldBps: 9500,
    allergens: ['fish'],
    diet: 'omnivore',
    supplier: 'fishmonger',
    area: 'cold',
    spot: 'cold-fish',
    shelfLifeDays: 3,
    dateKind: 'use_by',
    origin: 'NO',
    step: 500,
    swingBps: 500,
  },
  {
    key: 'anchovies',
    name: 'Sardellenfilets in Öl',
    category: 'fish',
    unit: 'g',
    price: 6800,
    allergens: ['fish'],
    diet: 'omnivore',
    supplier: 'fishmonger',
    area: 'station',
    spot: 'station-dressings',
    shelfLifeDays: 180,
    dateKind: 'best_before',
    origin: 'ES',
    pack: [500, 'Glas à 500 g'],
    minStock: 250,
    targetStock: 1000,
    finalStock: 620,
  },
  // Milchprodukte, Käse, Eier
  {
    key: 'cream',
    name: 'Vollrahm',
    category: 'dairy',
    unit: 'ml',
    price: 640,
    allergens: ['milk'],
    diet: 'vegetarian',
    supplier: 'wholesale',
    area: 'cold',
    spot: 'cold-dairy',
    shelfLifeDays: 10,
    dateKind: 'best_before',
    pack: [1000, 'Packung à 1 l'],
    minStock: 4000,
    targetStock: 12_000,
  },
  {
    key: 'milk',
    name: 'Vollmilch',
    category: 'dairy',
    unit: 'ml',
    price: 155,
    allergens: ['milk'],
    diet: 'vegetarian',
    supplier: 'wholesale',
    area: 'cold',
    spot: 'cold-dairy',
    shelfLifeDays: 8,
    dateKind: 'best_before',
    pack: [1000, 'Packung à 1 l'],
    minStock: 3000,
    targetStock: 8000,
  },
  {
    key: 'butter',
    name: 'Butter',
    category: 'dairy',
    unit: 'g',
    price: 1566,
    allergens: ['milk'],
    diet: 'vegetarian',
    supplier: 'wholesale',
    area: 'cold',
    spot: 'cold-dairy',
    shelfLifeDays: 45,
    dateKind: 'best_before',
    pack: [1000, 'Block à 1 kg'],
    minStock: 2000,
    targetStock: 6000,
    priceChange: { day: -21, bps: 800 },
  },
  {
    key: 'goatCheese',
    name: 'Ziegenfrischkäse',
    category: 'cheese',
    unit: 'g',
    price: 2850,
    allergens: ['milk'],
    diet: 'vegetarian',
    supplier: 'fishmonger',
    area: 'station',
    spot: 'station-garnish',
    shelfLifeDays: 14,
    dateKind: 'best_before',
    step: 500,
  },
  {
    key: 'cheese',
    name: 'Reibkäse, vegetarisch',
    category: 'cheese',
    unit: 'g',
    price: 2450,
    allergens: ['milk'],
    diet: 'vegetarian',
    supplier: 'wholesale',
    area: 'cold',
    spot: 'cold-dairy',
    shelfLifeDays: 30,
    dateKind: 'best_before',
    pack: [1000, 'Beutel à 1 kg'],
    minStock: 1000,
    targetStock: 4000,
  },
  {
    key: 'eggs',
    name: 'Eier',
    category: 'eggs',
    unit: 'pcs',
    price: 48_000,
    allergens: ['eggs'],
    diet: 'vegetarian',
    supplier: 'wholesale',
    area: 'cold',
    spot: 'cold-dairy',
    shelfLifeDays: 21,
    dateKind: 'best_before',
    pack: [30, 'Karton à 30 Stk.'],
    minStock: 30,
    targetStock: 120,
  },
  // Gemüse, Salate, Früchte (Gemüsehof Probe)
  {
    key: 'beetroot',
    name: 'Randen, roh',
    category: 'vegetables',
    unit: 'g',
    price: 290,
    yieldBps: 6700,
    diet: 'vegan',
    supplier: 'farm',
    area: 'cold',
    spot: 'cold-veg',
    shelfLifeDays: 21,
    dateKind: 'best_before',
    step: 1000,
  },
  {
    key: 'squash',
    name: 'Butternusskürbis',
    category: 'vegetables',
    unit: 'g',
    price: 380,
    yieldBps: 8400,
    diet: 'vegan',
    supplier: 'farm',
    area: 'cold',
    spot: 'cold-veg',
    shelfLifeDays: 30,
    dateKind: 'best_before',
    step: 1000,
  },
  {
    key: 'potatoes',
    name: 'Kartoffeln, mehlig',
    category: 'vegetables',
    unit: 'g',
    price: 160,
    yieldBps: 7500,
    diet: 'vegan',
    supplier: 'farm',
    area: 'dry',
    spot: 'dry-crates',
    shelfLifeDays: 30,
    dateKind: 'best_before',
    pack: [12_500, 'Sack à 12.5 kg'],
    minStock: 10_000,
    targetStock: 40_000,
  },
  {
    key: 'onions',
    name: 'Zwiebeln',
    category: 'vegetables',
    unit: 'g',
    price: 190,
    yieldBps: 9000,
    diet: 'vegan',
    supplier: 'farm',
    area: 'dry',
    spot: 'dry-crates',
    shelfLifeDays: 30,
    dateKind: 'best_before',
    pack: [5000, 'Sack à 5 kg'],
    minStock: 3000,
    targetStock: 15_000,
  },
  {
    key: 'carrots',
    name: 'Karotten',
    category: 'vegetables',
    unit: 'g',
    price: 180,
    yieldBps: 8900,
    diet: 'vegan',
    supplier: 'farm',
    area: 'cold',
    spot: 'cold-veg',
    shelfLifeDays: 14,
    dateKind: 'best_before',
    step: 1000,
  },
  {
    key: 'celeriac',
    name: 'Knollensellerie',
    category: 'vegetables',
    unit: 'g',
    price: 290,
    yieldBps: 8600,
    allergens: ['celery'],
    diet: 'vegan',
    supplier: 'farm',
    area: 'cold',
    spot: 'cold-veg',
    shelfLifeDays: 21,
    dateKind: 'best_before',
    step: 500,
  },
  {
    key: 'mushrooms',
    name: 'Champignons',
    category: 'vegetables',
    unit: 'g',
    price: 920,
    yieldBps: 9700,
    diet: 'vegan',
    supplier: 'farm',
    area: 'cold',
    spot: 'cold-veg',
    shelfLifeDays: 5,
    dateKind: 'best_before',
    step: 500,
    swingBps: 400,
  },
  {
    key: 'spinach',
    name: 'Blattspinat',
    category: 'vegetables',
    unit: 'g',
    price: 1450,
    yieldBps: 7200,
    diet: 'vegan',
    supplier: 'farm',
    area: 'cold',
    spot: 'cold-veg',
    shelfLifeDays: 4,
    dateKind: 'best_before',
    step: 500,
    swingBps: 600,
  },
  {
    key: 'lambsLettuce',
    name: 'Nüsslisalat',
    category: 'herbs',
    unit: 'g',
    price: 2400,
    yieldBps: 9000,
    diet: 'vegan',
    supplier: 'farm',
    area: 'cold',
    spot: 'cold-veg',
    shelfLifeDays: 4,
    dateKind: 'best_before',
    step: 250,
    swingBps: 800,
  },
  {
    key: 'romaine',
    name: 'Romanasalat',
    category: 'herbs',
    unit: 'g',
    price: 480,
    yieldBps: 9400,
    diet: 'vegan',
    supplier: 'farm',
    area: 'cold',
    spot: 'cold-veg',
    shelfLifeDays: 5,
    dateKind: 'best_before',
    step: 500,
    swingBps: 500,
  },
  {
    key: 'apples',
    name: 'Äpfel Boskoop',
    category: 'fruit',
    unit: 'g',
    price: 330,
    yieldBps: 7700,
    diet: 'vegan',
    supplier: 'farm',
    area: 'cold',
    spot: 'cold-veg',
    shelfLifeDays: 30,
    dateKind: 'best_before',
    step: 1000,
  },
  // Brot (Bäckerei Vorlage)
  {
    key: 'ciabatta',
    name: 'Ciabatta',
    category: 'bakery',
    unit: 'pcs',
    price: 120_000,
    allergens: ['gluten'],
    diet: 'vegan',
    supplier: 'bakery',
    area: 'dry',
    spot: 'dry-bread',
    shelfLifeDays: 2,
    dateKind: 'best_before',
    step: 1,
  },
  // Trockenwaren, Öle, Konserven (Grosshandel Modell)
  {
    key: 'flour',
    name: 'Weissmehl',
    category: 'dry',
    unit: 'g',
    price: 145,
    allergens: ['gluten'],
    diet: 'vegan',
    supplier: 'wholesale',
    area: 'dry',
    spot: 'dry-flour',
    shelfLifeDays: 365,
    dateKind: 'best_before',
    pack: [10_000, 'Sack à 10 kg'],
    minStock: 5000,
    targetStock: 20_000,
    finalStock: 3200,
    quietDays: 8,
  },
  {
    key: 'sugar',
    name: 'Zucker',
    category: 'dry',
    unit: 'g',
    price: 135,
    diet: 'vegan',
    supplier: 'wholesale',
    area: 'dry',
    spot: 'dry-flour',
    shelfLifeDays: 730,
    dateKind: 'best_before',
    pack: [5000, 'Sack à 5 kg'],
    minStock: 2000,
    targetStock: 10_000,
    finalStock: 6400,
  },
  {
    key: 'rice',
    name: 'Risottoreis Carnaroli',
    category: 'dry',
    unit: 'g',
    price: 540,
    diet: 'vegan',
    supplier: 'wholesale',
    area: 'dry',
    spot: 'dry-flour',
    shelfLifeDays: 540,
    dateKind: 'best_before',
    pack: [5000, 'Sack à 5 kg'],
    minStock: 5000,
    targetStock: 25_000,
    finalStock: 24_100,
  },
  {
    key: 'pasta',
    name: 'Hörnli',
    category: 'dry',
    unit: 'g',
    price: 265,
    allergens: ['gluten'],
    diet: 'vegan',
    supplier: 'wholesale',
    area: 'dry',
    spot: 'dry-flour',
    shelfLifeDays: 540,
    dateKind: 'best_before',
    pack: [5000, 'Karton à 5 kg'],
    minStock: 4000,
    targetStock: 15_000,
    finalStock: 9600,
  },
  {
    key: 'rapeseedOil',
    name: 'Rapsöl',
    category: 'oils',
    unit: 'ml',
    price: 390,
    diet: 'vegan',
    supplier: 'wholesale',
    area: 'dry',
    spot: 'dry-oil',
    shelfLifeDays: 365,
    dateKind: 'best_before',
    pack: [10_000, 'Kanister à 10 l'],
    minStock: 10_000,
    targetStock: 30_000,
    finalStock: 6500,
    quietDays: 8,
  },
  {
    key: 'oliveOil',
    name: 'Olivenöl extra vergine',
    category: 'oils',
    unit: 'ml',
    price: 1290,
    diet: 'vegan',
    supplier: 'wholesale',
    area: 'dry',
    spot: 'dry-oil',
    shelfLifeDays: 540,
    dateKind: 'best_before',
    pack: [5000, 'Kanister à 5 l'],
    minStock: 2000,
    targetStock: 10_000,
    finalStock: 5800,
  },
  {
    key: 'vinegar',
    name: 'Weissweinessig',
    category: 'sauces',
    unit: 'ml',
    price: 340,
    allergens: ['sulphites'],
    diet: 'vegan',
    supplier: 'wholesale',
    area: 'dry',
    spot: 'dry-oil',
    shelfLifeDays: 730,
    dateKind: 'best_before',
    pack: [1000, 'Flasche à 1 l'],
    minStock: 1000,
    targetStock: 5000,
    finalStock: 2700,
  },
  {
    key: 'mustard',
    name: 'Senf',
    category: 'sauces',
    unit: 'g',
    price: 680,
    allergens: ['mustard'],
    diet: 'vegan',
    supplier: 'wholesale',
    area: 'cold',
    spot: 'cold-dairy',
    shelfLifeDays: 365,
    dateKind: 'best_before',
    pack: [1000, 'Eimer à 1 kg'],
    minStock: 300,
    targetStock: 2000,
    finalStock: 1150,
  },
  {
    key: 'tomatoes',
    name: 'Tomaten, gehackt',
    category: 'canned',
    unit: 'g',
    price: 290,
    diet: 'vegan',
    supplier: 'wholesale',
    area: 'dry',
    spot: 'dry-oil',
    shelfLifeDays: 730,
    dateKind: 'best_before',
    pack: [2500, 'Dose à 2.5 kg'],
    minStock: 5000,
    targetStock: 20_000,
    finalStock: 12_500,
  },
  {
    key: 'stockPaste',
    name: 'Gemüsebouillon, Paste',
    category: 'sauces',
    unit: 'g',
    price: 1650,
    allergens: ['celery'],
    diet: 'vegan',
    supplier: 'wholesale',
    area: 'dry',
    spot: 'dry-oil',
    shelfLifeDays: 540,
    dateKind: 'best_before',
    pack: [1000, 'Dose à 1 kg'],
    minStock: 300,
    targetStock: 2000,
    finalStock: 1200,
  },
  {
    key: 'honey',
    name: 'Honig',
    category: 'sweets',
    unit: 'g',
    price: 1850,
    diet: 'vegetarian',
    supplier: 'wholesale',
    area: 'dry',
    spot: 'dry-flour',
    shelfLifeDays: 730,
    dateKind: 'best_before',
    pack: [1000, 'Glas à 1 kg'],
    minStock: 300,
    targetStock: 2000,
    finalStock: 1300,
  },
  {
    key: 'walnuts',
    name: 'Baumnusskerne',
    category: 'dry',
    unit: 'g',
    price: 2250,
    allergens: ['nuts'],
    diet: 'vegan',
    supplier: 'wholesale',
    area: 'dry',
    spot: 'dry-flour',
    shelfLifeDays: 270,
    dateKind: 'best_before',
    pack: [1000, 'Beutel à 1 kg'],
    minStock: 500,
    targetStock: 3000,
    finalStock: 1400,
  },
  {
    key: 'couverture',
    name: 'Couverture dunkel 64 %',
    category: 'sweets',
    unit: 'g',
    price: 1950,
    allergens: ['soy'],
    traces: ['milk', 'nuts'],
    diet: 'vegan',
    supplier: 'wholesale',
    area: 'dry',
    spot: 'dry-flour',
    shelfLifeDays: 365,
    dateKind: 'best_before',
    pack: [2500, 'Beutel à 2.5 kg'],
    minStock: 1000,
    targetStock: 7500,
    finalStock: 4300,
  },
  {
    key: 'applesauce',
    name: 'Apfelmus',
    category: 'canned',
    unit: 'g',
    price: 420,
    diet: 'vegan',
    supplier: 'wholesale',
    area: 'dry',
    spot: 'dry-oil',
    shelfLifeDays: 540,
    dateKind: 'best_before',
    pack: [2500, 'Dose à 2.5 kg'],
    minStock: 2500,
    targetStock: 10_000,
    finalStock: 6800,
  },
  // Tiefkühlprodukte (Grosshandel Modell)
  {
    key: 'peas',
    name: 'Erbsen, fein',
    category: 'frozen',
    unit: 'g',
    price: 420,
    diet: 'vegan',
    supplier: 'wholesale',
    area: 'frozen',
    spot: 'frozen-shelf',
    shelfLifeDays: 365,
    dateKind: 'best_before',
    pack: [2500, 'Beutel à 2.5 kg'],
    minStock: 2500,
    targetStock: 12_500,
    finalStock: 11_800,
  },
  {
    key: 'porcini',
    name: 'Steinpilze, tiefgekühlt',
    category: 'frozen',
    unit: 'g',
    price: 3950,
    diet: 'vegan',
    supplier: 'wholesale',
    area: 'frozen',
    spot: 'frozen-shelf',
    shelfLifeDays: 365,
    dateKind: 'best_before',
    pack: [1000, 'Beutel à 1 kg'],
    minStock: 2000,
    targetStock: 8000,
    finalStock: 5300,
  },
  {
    key: 'iceCream',
    name: 'Vanilleglace',
    category: 'frozen',
    unit: 'ml',
    price: 980,
    allergens: ['eggs', 'milk'],
    diet: 'vegetarian',
    supplier: 'wholesale',
    area: 'frozen',
    spot: 'frozen-chest',
    shelfLifeDays: 365,
    dateKind: 'best_before',
    pack: [5000, 'Schale à 5 l'],
    minStock: 2500,
    targetStock: 15_000,
    finalStock: 9200,
  },
  // Kochweine (Getränke Demo)
  {
    key: 'redWine',
    name: 'Rotwein zum Kochen',
    category: 'wine',
    unit: 'ml',
    price: 860,
    allergens: ['sulphites'],
    diet: 'vegan',
    supplier: 'drinks',
    area: 'bar',
    spot: 'bar-red',
    dateKind: 'best_before',
    pack: [6000, 'Karton à 6 × 1 l'],
    minStock: 3000,
    targetStock: 12_000,
    finalStock: 8250,
    noDate: true,
  },
  {
    key: 'whiteWine',
    name: 'Weisswein zum Kochen',
    category: 'wine',
    unit: 'ml',
    price: 790,
    allergens: ['sulphites'],
    diet: 'vegan',
    supplier: 'drinks',
    area: 'bar',
    spot: 'bar-white',
    dateKind: 'best_before',
    pack: [6000, 'Karton à 6 × 1 l'],
    minStock: 3000,
    targetStock: 12_000,
    finalStock: 7400,
    noDate: true,
  },
  // Eigenproduktion: die Komponenten, ihr Preis folgt aus der letzten Produktion
  {
    key: 'vealStock',
    name: 'Kalbsfond',
    category: 'prepared',
    unit: 'ml',
    price: 0,
    diet: 'vegan',
    area: 'cold',
    spot: 'cold-dairy',
    shelfLifeDays: 3,
    dateKind: 'use_by',
    recipe: 'vealStock',
  },
  {
    key: 'jus',
    name: 'Rotweinjus',
    category: 'prepared',
    unit: 'ml',
    price: 0,
    diet: 'vegan',
    area: 'cold',
    spot: 'cold-dairy',
    shelfLifeDays: 3,
    dateKind: 'use_by',
    recipe: 'jus',
  },
  {
    key: 'tomatoSauce',
    name: 'Tomatensauce',
    category: 'prepared',
    unit: 'ml',
    price: 0,
    diet: 'vegan',
    area: 'cold',
    spot: 'cold-dairy',
    shelfLifeDays: 3,
    dateKind: 'use_by',
    recipe: 'tomatoSauce',
  },
  {
    key: 'vinaigrette',
    name: 'Vinaigrette',
    category: 'prepared',
    unit: 'ml',
    price: 0,
    diet: 'vegan',
    area: 'station',
    spot: 'station-dressings',
    shelfLifeDays: 6,
    dateKind: 'use_by',
    recipe: 'vinaigrette',
  },
  {
    key: 'mash',
    name: 'Kartoffelstock',
    category: 'prepared',
    unit: 'g',
    price: 0,
    diet: 'vegan',
    area: 'cold',
    spot: 'cold-dairy',
    shelfLifeDays: 2,
    dateKind: 'use_by',
    recipe: 'mash',
  },
  // Verpackung und Einweg, bei Markt Nord gekauft (ADR-0015). Nicht im Plan der Küche, sondern
  // für das Mitnehmen, daher ohne Mindestbestand und ohne Lieferplan.
  {
    key: 'takeawayBox',
    name: 'Take-away-Box',
    category: 'packaging',
    unit: 'pcs',
    price: 35_000,
    diet: 'vegan',
    supplier: 'market',
    area: 'dry',
    pack: [50, 'Kolli à 50 Stk.'],
    dateKind: 'best_before',
  },
];

export type Ingredient = readonly [article: string, quantity: number, note?: string];

export interface RecipeDef {
  key: string;
  name: string;
  kind: 'dish' | 'component';
  course: Course;
  /** Dishes: the portions the ingredients are written for. Components: one batch. */
  portions: number;
  ingredients: readonly Ingredient[];
  steps: readonly string[];
  prepMinutes: number;
  description?: string;
  /** Menu price of a portion, VAT included (Beispielwert). */
  price?: number;
  labels?: readonly DishLabel[];
  /** A component: what one batch gives. */
  output?: readonly [article: string, quantity: number];
  shelfLifeDays?: number;
  picture?: DishPicture;
  /** Dishes: portions sold on an ordinary day. Without it the dish is not on the sales plan. */
  daily?: number;
  /** Dishes: VAT of this dish if it is not the house rate, e.g. 260 for take-away (docs/fakten.md). */
  vatBps?: number;
  /** Components: made every this many days, the last time this many days before today. */
  every?: number;
  lastDaysAgo?: number;
}

/**
 * Five components made in house and ten dishes. Quantities are net, as they go into the pan;
 * stock and cost take the gross amount through the yield of each article.
 */
export const RECIPES: readonly RecipeDef[] = [
  {
    key: 'vealStock',
    name: 'Kalbsfond',
    kind: 'component',
    course: 'other',
    portions: 1,
    output: ['vealStock', 6000],
    ingredients: [
      ['bones', 5000],
      ['carrots', 500],
      ['celeriac', 300],
      ['onions', 400],
      ['tomatoes', 500],
      ['rapeseedOil', 50],
    ],
    steps: [
      'Kalbsknochen im Ofen bei 220 °C goldbraun rösten.',
      'Karotten, Sellerie und Zwiebeln grob schneiden, mitrösten, Tomaten beigeben.',
      'Mit 10 l kaltem Wasser auffüllen, aufkochen und abschäumen.',
      'Sechs Stunden leise köcheln lassen, durch ein feines Tuch passieren.',
      'Rasch unter 5 °C abkühlen, beschriften und in die Kühlzelle stellen.',
    ],
    prepMinutes: 400,
    shelfLifeDays: 3,
    every: 3,
    lastDaysAgo: 3,
  },
  {
    key: 'jus',
    name: 'Rotweinjus',
    kind: 'component',
    course: 'other',
    portions: 1,
    output: ['jus', 1500],
    ingredients: [
      ['vealStock', 3000],
      ['redWine', 750],
      ['onions', 300],
      ['tomatoes', 200],
      ['sugar', 20],
      ['butter', 100, 'kalt, zum Montieren'],
    ],
    steps: [
      'Zwiebeln anschwitzen, Zucker darin hell karamellisieren, Tomaten beigeben.',
      'Mit Rotwein ablöschen und auf einen Drittel einkochen.',
      'Kalbsfond beigeben und um die Hälfte reduzieren.',
      'Passieren und vor dem Service mit kalter Butter montieren.',
    ],
    prepMinutes: 120,
    shelfLifeDays: 3,
    every: 3,
    lastDaysAgo: 2,
  },
  {
    key: 'tomatoSauce',
    name: 'Tomatensauce',
    kind: 'component',
    course: 'other',
    portions: 1,
    output: ['tomatoSauce', 4000],
    ingredients: [
      ['tomatoes', 5000],
      ['onions', 400],
      ['oliveOil', 150],
      ['sugar', 30],
    ],
    steps: [
      'Zwiebeln fein schneiden und im Olivenöl glasig dünsten.',
      'Tomaten und Zucker beigeben, eine Stunde leise köcheln lassen.',
      'Abschmecken, rasch abkühlen und abfüllen.',
    ],
    prepMinutes: 80,
    shelfLifeDays: 3,
    every: 3,
    lastDaysAgo: 1,
  },
  {
    key: 'vinaigrette',
    name: 'Vinaigrette',
    kind: 'component',
    course: 'other',
    portions: 1,
    output: ['vinaigrette', 1000],
    ingredients: [
      ['rapeseedOil', 500],
      ['vinegar', 250],
      ['mustard', 60],
      ['honey', 40],
      ['onions', 80],
    ],
    steps: [
      'Zwiebeln sehr fein hacken.',
      'Essig, Senf und Honig verrühren, das Öl langsam einrühren.',
      'Zwiebeln beigeben, abschmecken und in Flaschen abfüllen.',
    ],
    prepMinutes: 15,
    shelfLifeDays: 6,
    every: 6,
    lastDaysAgo: 4,
  },
  {
    key: 'mash',
    name: 'Kartoffelstock',
    kind: 'component',
    course: 'side',
    portions: 1,
    output: ['mash', 5000],
    ingredients: [
      ['potatoes', 4000],
      ['milk', 1000],
      ['butter', 250],
    ],
    steps: [
      'Kartoffeln schälen, in Salzwasser weich kochen und abschütten.',
      'Durch das Passevite treiben, heisse Milch und Butter einrühren.',
      'Mit Salz und Muskat abschmecken, rasch abkühlen und portionenweise abfüllen.',
    ],
    prepMinutes: 50,
    shelfLifeDays: 2,
    every: 2,
    lastDaysAgo: 1,
  },
  {
    key: 'carpaccio',
    name: 'Randen-Carpaccio mit Ziegenkäse',
    kind: 'dish',
    course: 'starter',
    portions: 10,
    description:
      'Hauchdünn geschnittene Randen mit Ziegenfrischkäse, gerösteten Baumnüssen, Honig und Nüsslisalat.',
    price: 1850,
    labels: ['house_special', 'regional'],
    ingredients: [
      ['beetroot', 1200],
      ['goatCheese', 300],
      ['walnuts', 100],
      ['honey', 60],
      ['lambsLettuce', 150],
      ['vinaigrette', 200],
      ['oliveOil', 50],
    ],
    steps: [
      'Randen in Salzwasser weich kochen, schälen und auskühlen lassen.',
      'Hauchdünn hobeln und fächerartig auf kalte Teller legen.',
      'Baumnüsse grob hacken und ohne Fett rösten.',
      'Mit Vinaigrette und Olivenöl beträufeln, Ziegenkäse darüber zupfen.',
      'Honig darüberziehen, mit Nüsslisalat und Nüssen anrichten.',
    ],
    prepMinutes: 15,
    picture: 'carpaccio',
    daily: 8,
  },
  {
    key: 'soup',
    name: 'Kürbissuppe',
    kind: 'dish',
    course: 'soup',
    portions: 10,
    description: 'Samtige Suppe vom Butternusskürbis mit einem Hauch Rahm und Croûtons.',
    price: 1050,
    labels: ['seasonal'],
    ingredients: [
      ['squash', 1800],
      ['onions', 200],
      ['butter', 80],
      ['stockPaste', 50],
      ['cream', 300],
      ['ciabatta', 3, 'für die Croûtons'],
    ],
    steps: [
      'Kürbis schälen, entkernen und würfeln, Zwiebeln schneiden.',
      'Beides in Butter andünsten, mit 2 l Gemüsebouillon auffüllen.',
      'Weich kochen, fein mixen, Rahm beigeben und abschmecken.',
      'Ciabatta würfeln und in der Pfanne zu Croûtons rösten.',
    ],
    prepMinutes: 45,
    picture: 'soup',
    daily: 14,
  },
  {
    key: 'entrecote',
    name: 'Entrecôte mit Rotweinjus und Kartoffelstock',
    kind: 'dish',
    course: 'main',
    portions: 10,
    description: 'Schweizer Rindsentrecôte vom Grill, Rotweinjus, Kartoffelstock und Marktgemüse.',
    price: 4200,
    labels: ['house_special'],
    ingredients: [
      ['entrecote', 1800],
      ['jus', 600],
      ['mash', 1800],
      ['carrots', 600],
      ['peas', 400],
      ['butter', 100],
    ],
    steps: [
      'Entrecôte eine Stunde vor dem Service temperieren und würzen.',
      'Auf dem heissen Grill auf beiden Seiten zeichnen, im Ofen auf 54 °C Kerntemperatur garen.',
      'Karotten glasieren, Erbsen in Butter schwenken.',
      'Kartoffelstock und Jus erhitzen, Fleisch tranchieren und anrichten.',
    ],
    prepMinutes: 25,
    picture: 'entrecote',
    daily: 9,
  },
  {
    key: 'salmon',
    name: 'Lachs mit Rahmsauce',
    kind: 'dish',
    course: 'main',
    portions: 10,
    description: 'Gebratenes Lachsfilet auf Blattspinat mit Weissweinrahmsauce und Salzkartoffeln.',
    price: 3400,
    ingredients: [
      ['salmon', 1500],
      ['cream', 600],
      ['whiteWine', 200],
      ['butter', 50],
      ['spinach', 1000],
      ['potatoes', 1800],
      ['onions', 100],
    ],
    steps: [
      'Kartoffeln schälen, tournieren und in Salzwasser garen.',
      'Zwiebeln andünsten, mit Weisswein ablöschen, Rahm beigeben und sämig einkochen.',
      'Lachs auf der Hautseite knusprig braten, kurz wenden.',
      'Spinat in Butter zusammenfallen lassen, alles mit der Sauce anrichten.',
    ],
    prepMinutes: 20,
    picture: 'salmon',
    daily: 8,
  },
  {
    key: 'risotto',
    name: 'Risotto mit Steinpilzen',
    kind: 'dish',
    course: 'main',
    portions: 10,
    description: 'Cremiges Carnaroli-Risotto mit Steinpilzen, Butter und Hartkäse.',
    price: 2800,
    labels: ['seasonal'],
    ingredients: [
      ['rice', 900],
      ['porcini', 800],
      ['cheese', 300],
      ['butter', 200],
      ['whiteWine', 300],
      ['stockPaste', 60],
      ['onions', 200],
      ['oliveOil', 50],
    ],
    steps: [
      'Zwiebeln fein hacken und in Olivenöl glasig dünsten, Reis beigeben.',
      'Mit Weisswein ablöschen, nach und nach heisse Bouillon zugeben.',
      'Steinpilze in Butter anbraten, nach 15 Minuten unter das Risotto ziehen.',
      'Mit Butter und Käse cremig rühren und sofort servieren.',
    ],
    prepMinutes: 25,
    picture: 'risotto',
    daily: 7,
  },
  {
    key: 'alpine',
    name: 'Älplermagronen mit Apfelmus',
    kind: 'dish',
    course: 'main',
    portions: 10,
    description: 'Hörnli und Kartoffeln mit Rahm und Käse, Röstzwiebeln, Speck und Apfelmus.',
    price: 2250,
    labels: ['regional'],
    ingredients: [
      ['pasta', 1000],
      ['potatoes', 800],
      ['cheese', 600],
      ['cream', 500],
      ['onions', 400],
      ['butter', 100],
      ['bacon', 400],
      ['applesauce', 800],
    ],
    steps: [
      'Kartoffeln würfeln und mit den Hörnli in Salzwasser al dente kochen.',
      'Zwiebeln in Ringe schneiden und in Butter goldbraun rösten, Speck mitbraten.',
      'Rahm aufkochen, Hörnli und Kartoffeln darin schwenken, Käse einrühren.',
      'Mit Röstzwiebeln und Speck anrichten, Apfelmus separat servieren.',
    ],
    prepMinutes: 30,
    picture: 'alpine',
    daily: 10,
  },
  {
    key: 'geschnetzeltes',
    name: 'Zürcher Geschnetzeltes mit Rösti',
    kind: 'dish',
    course: 'main',
    portions: 10,
    description: 'Kalbfleisch und Champignons an Rahmsauce, dazu eine knusprige Butterrösti.',
    price: 3950,
    labels: ['house_special', 'regional'],
    ingredients: [
      ['veal', 2000],
      ['mushrooms', 600],
      ['cream', 800],
      ['vealStock', 400],
      ['whiteWine', 200],
      ['flour', 40],
      ['butter', 250],
      ['onions', 150],
      ['potatoes', 2500, 'für die Rösti, am Vortag gekocht'],
    ],
    steps: [
      'Gekochte Kartoffeln grob raffeln und in Butter zu Rösti braten.',
      'Kalbfleisch leicht mehlen und portionenweise kurz scharf anbraten.',
      'Zwiebeln und Champignons andünsten, mit Weisswein ablöschen.',
      'Kalbsfond und Rahm beigeben, einkochen, Fleisch nur noch erwärmen.',
    ],
    prepMinutes: 30,
    picture: 'geschnetzeltes',
    daily: 9,
  },
  {
    key: 'caesar',
    name: 'Caesar Salad mit Poulet',
    kind: 'dish',
    course: 'salad',
    portions: 10,
    description:
      'Romanasalat mit gebratener Pouletbrust, Croûtons, Käse und hausgemachtem Dressing.',
    price: 2600,
    ingredients: [
      ['romaine', 1500],
      ['chicken', 1500],
      ['ciabatta', 4, 'für die Croûtons'],
      ['cheese', 200],
      ['eggs', 3, 'Eigelb für das Dressing'],
      ['anchovies', 60],
      ['mustard', 30],
      ['rapeseedOil', 300],
      ['vinegar', 50],
    ],
    steps: [
      'Eigelb, Senf, Sardellen und Essig mixen, Öl langsam einlaufen lassen.',
      'Pouletbrust würzen, braten bis 72 °C Kerntemperatur, ruhen lassen und schneiden.',
      'Ciabatta würfeln und zu Croûtons rösten.',
      'Salat mit dem Dressing mischen, mit Poulet, Croûtons und Käse anrichten.',
    ],
    prepMinutes: 20,
    picture: 'caesar',
    daily: 10,
  },
  {
    key: 'mousse',
    name: 'Schokoladenmousse',
    kind: 'dish',
    course: 'dessert',
    portions: 10,
    description: 'Luftige Mousse aus dunkler Couverture mit geschlagenem Rahm.',
    price: 1150,
    ingredients: [
      ['couverture', 700],
      ['eggs', 6],
      ['cream', 500],
      ['sugar', 80],
    ],
    steps: [
      'Couverture über dem Wasserbad schmelzen.',
      'Eigelb mit der Hälfte des Zuckers schaumig schlagen, Couverture einrühren.',
      'Eiweiss mit dem restlichen Zucker steif schlagen, Rahm schlagen.',
      'Alles sorgfältig unterheben, mindestens vier Stunden kühl stellen und am selben Tag servieren.',
    ],
    prepMinutes: 30,
    picture: 'mousse',
    daily: 9,
  },
  {
    key: 'fritters',
    name: 'Apfelküchlein mit Vanilleglace',
    kind: 'dish',
    course: 'dessert',
    portions: 10,
    description: 'Apfelringe im Backteig, knusprig ausgebacken, mit Zimtzucker und Vanilleglace.',
    price: 1350,
    ingredients: [
      ['apples', 1500],
      ['flour', 400],
      ['eggs', 3],
      ['milk', 300],
      ['sugar', 150],
      ['rapeseedOil', 500, 'zum Ausbacken'],
      ['iceCream', 1000],
    ],
    steps: [
      'Mehl, Eier und Milch zu einem glatten Teig rühren, 30 Minuten ruhen lassen.',
      'Äpfel schälen, Kerngehäuse ausstechen und in Ringe schneiden.',
      'Ringe durch den Teig ziehen und bei 170 °C goldbraun ausbacken.',
      'In Zimtzucker wenden und mit zwei Kugeln Vanilleglace servieren.',
    ],
    prepMinutes: 20,
    picture: 'fritters',
    daily: 6,
  },
  {
    key: 'caesarToGo',
    name: 'Caesar Salad zum Mitnehmen',
    kind: 'dish',
    course: 'salad',
    portions: 10,
    // The reduced VAT rate needs the separation from dining in (docs/fakten.md, section 3.2).
    description:
      'Caesar Salad mit Poulet im Karton, Dressing und Croûtons getrennt. Zum Mitnehmen mit 2.6 % MWST nur, wenn die Abgrenzung zum Verzehr vor Ort gemacht ist und der Beleg das Mitnehmen ausweist; sonst gilt der Normalsatz von 8.1 %.',
    price: 2400,
    vatBps: 260,
    ingredients: [
      ['romaine', 1500],
      ['chicken', 1500],
      ['ciabatta', 4, 'für die Croûtons'],
      ['cheese', 200],
      ['eggs', 3, 'Eigelb für das Dressing'],
      ['anchovies', 60],
      ['mustard', 30],
      ['rapeseedOil', 300],
      ['vinegar', 50],
      ['takeawayBox', 10, 'eine Box je Portion'],
    ],
    steps: [
      'Salat wie im Restaurant zubereiten, das Dressing separat abfüllen.',
      'Croûtons in ein eigenes Säckchen geben, damit sie knusprig bleiben.',
      'Salat in die Take-away-Box legen, Poulet und Käse darauf verteilen.',
      'Box deckeln, mit Abholzeit beschriften und rasch in die Kühlzelle stellen.',
    ],
    prepMinutes: 20,
    picture: 'takeaway',
  },
];

/** Portions sold on a weekday, against an ordinary day: quiet Monday, full Friday and Saturday. */
export const WEEKDAY_FACTOR: Readonly<Record<Weekday, number>> = {
  mon: 0.72,
  tue: 0.86,
  wed: 0.94,
  thu: 1,
  fri: 1.3,
  sat: 1.4,
  sun: 0.78,
};

/** What the team eats every day: pasta with the house tomato sauce and cheese. */
export const STAFF_MEAL: readonly Ingredient[] = [
  ['pasta', 600],
  ['tomatoSauce', 800],
  ['cheese', 80],
];

export interface HygieneTaskDef {
  key: string;
  name: string;
  area?: AreaKey;
  frequency: TaskFrequency;
  weekday?: Weekday;
  instructions: string;
  /** Days before today on which the check is missing. */
  missed: readonly number[];
}

export const HYGIENE_TASKS: readonly HygieneTaskDef[] = [
  {
    key: 'surfaces',
    name: 'Arbeitsflächen reinigen und desinfizieren',
    area: 'station',
    frequency: 'daily',
    instructions:
      'Nach dem Service: abräumen, mit heissem Wasser reinigen, desinfizieren, trocknen lassen.',
    missed: [-37, -12],
  },
  {
    key: 'floor',
    name: 'Küchenboden nass reinigen',
    frequency: 'daily',
    instructions: 'Nach dem Abendservice, Abläufe frei machen, Gummischieber trocknen.',
    missed: [-44, -20, -6],
  },
  {
    key: 'drawers',
    name: 'Kühlschubladen auswischen',
    area: 'station',
    frequency: 'daily',
    instructions: 'Ausräumen, mit Reiniger auswischen, Dichtungen prüfen, Ware beschriftet zurück.',
    missed: [-29],
  },
  {
    key: 'coldRoom',
    name: 'Kühlzelle reinigen, Regale auswischen',
    area: 'cold',
    frequency: 'weekly',
    weekday: 'mon',
    instructions: 'Regale abräumen und auswischen, Boden reinigen, Abgelaufenes aussortieren.',
    missed: [],
  },
  {
    key: 'hood',
    name: 'Fettfilter der Dampfabzugshaube reinigen',
    frequency: 'weekly',
    weekday: 'fri',
    instructions: 'Filter in die Spülmaschine, Haube innen abwischen.',
    missed: [-24],
  },
  {
    key: 'dryStore',
    name: 'Trockenlager kontrollieren',
    area: 'dry',
    frequency: 'weekly',
    weekday: 'wed',
    instructions: 'Ordnung, Schädlingsspuren, angebrochene Packungen verschlossen und beschriftet.',
    missed: [],
  },
  {
    key: 'freezer',
    name: 'Tiefkühlzelle abtauen und reinigen',
    area: 'frozen',
    frequency: 'monthly',
    instructions:
      'Ware in die Truhe umlagern, abtauen, reinigen, nach dem Einschalten Temperatur prüfen.',
    missed: [],
  },
];

/** The two published cards: sections with the keys of their dishes. */
export const MENU_CARDS: readonly {
  name: string;
  intro: string;
  footer: string;
  sections: readonly { title: string; dishes: readonly string[] }[];
}[] = [
  {
    name: 'Mittagskarte',
    intro: 'Von Montag bis Sonntag, 11.30 bis 14 Uhr. Jeden Tag ein Tagesmenü mit Suppe.',
    footer:
      'Preise in CHF, inklusive 8.1 % Mehrwertsteuer. Auskunft über Allergene gibt unser Service-Team.',
    sections: [
      { title: 'Suppe und Salat', dishes: ['soup', 'caesar'] },
      { title: 'Hauptgänge', dishes: ['alpine', 'geschnetzeltes', 'risotto', 'salmon'] },
      { title: 'Dessert', dishes: ['mousse'] },
    ],
  },
  {
    name: 'Abendkarte',
    intro: 'Ab 18 Uhr. Fleisch aus der Schweiz, Gemüse vom Hof aus der Region.',
    footer:
      'Preise in CHF, inklusive 8.1 % Mehrwertsteuer. Auskunft über Allergene gibt unser Service-Team.',
    sections: [
      { title: 'Vorspeisen', dishes: ['carpaccio', 'soup', 'caesar'] },
      // Only the dish that is not on the lunch lines: a sale has no slot, so the meals of a lunch
      // line would count the evening portions too (ADR-0015, the meal counts).
      { title: 'Hauptgänge', dishes: ['entrecote'] },
      { title: 'Desserts', dishes: ['mousse', 'fritters'] },
    ],
  },
];

/** The menu plan of the coming week: dishes per meal, with the share of the day's portions. */
export const PLAN_SLOTS: readonly { slot: PlanSlot; dishes: readonly [string, number][] }[] = [
  {
    slot: 'dinner',
    // Salmon is a lunch special (DAILY_SPECIALS), so it is not in the dinner plan either.
    dishes: [
      ['carpaccio', 0.9],
      ['entrecote', 0.9],
    ],
  },
];

/**
 * The dish of the day at lunch, turning through the week (Monday first). Risotto is the Vegi
 * line's dish every day, so the dish of the day does not take it.
 */
export const DAILY_SPECIALS: readonly string[] = [
  'alpine',
  'geschnetzeltes',
  'salmon',
  'alpine',
  'geschnetzeltes',
  'salmon',
  'alpine',
];

const WEEK: readonly Weekday[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

/**
 * The menu lines of the lunch (ADR-0015). Each line serves one dish a day, so its meal counts
 * and its waste have one dish to count. Vegi is a line that promises a diet: its dishes are
 * checked against the computed declaration (ADR-0008).
 */
export interface MenuLineDef {
  key: string;
  name: string;
  sortOrder: number;
  /** Goods one meal of the line may cost, in Rappen. */
  costTargetRappen: number;
  requiredDiet?: Diet;
  /** The dish the line serves on a weekday. */
  dishOn: (weekday: Weekday) => string;
}

export const MENU_LINES: readonly MenuLineDef[] = [
  {
    key: 'mittag',
    name: 'Mittagsmenü',
    sortOrder: 0,
    costTargetRappen: 900,
    dishOn: (weekday) => DAILY_SPECIALS[WEEK.indexOf(weekday)] ?? 'alpine',
  },
  {
    key: 'vegi',
    name: 'Vegi',
    sortOrder: 1,
    costTargetRappen: 800,
    requiredDiet: 'vegetarian',
    dishOn: () => 'risotto',
  },
];

/**
 * One line of a receipt from the market. The price is the article's price on the day, so the
 * purchase does not move it; a promo line costs less and keeps the regular price (ADR-0015).
 */
export interface MarketLineDef {
  article: string;
  quantity: number;
  /** How many packs («Kolli») the line is. */
  packs?: number;
  /** Bought on offer («Aktion»): not the price of the article. */
  promo?: boolean;
  /** Fresh goods: days from the purchase to the date on the pack. */
  shelfDays?: number;
}

/** A purchase at the market: one receipt, with what on it is not goods in stock. */
export interface MarketPurchaseDef {
  /** Days from today; -1 is yesterday. */
  day: number;
  documentNumber: string;
  lines: readonly MarketLineDef[];
  others: readonly { kind: ReceiptAmountKind; amountRappen: number; note?: string }[];
}

export const MARKET_PURCHASES: readonly MarketPurchaseDef[] = [
  {
    day: -13,
    documentNumber: 'B-48213',
    lines: [
      { article: 'takeawayBox', quantity: 100, packs: 2 },
      { article: 'sugar', quantity: 5000 },
    ],
    others: [
      { kind: 'deposit', amountRappen: 2000, note: 'Depot Mehrwegkisten' },
      { kind: 'private', amountRappen: 690, note: 'Putzmittel, privat' },
    ],
  },
  {
    day: -6,
    documentNumber: 'B-48377',
    lines: [
      { article: 'apples', quantity: 3000, shelfDays: 10 },
      { article: 'oliveOil', quantity: 5000, promo: true },
    ],
    others: [],
  },
  {
    day: -2,
    documentNumber: 'B-48519',
    lines: [
      { article: 'takeawayBox', quantity: 50, packs: 1 },
      { article: 'mustard', quantity: 1000 },
      { article: 'vinegar', quantity: 1000 },
    ],
    others: [{ kind: 'deposit_return', amountRappen: -1200, note: 'Depot Kisten zurück' }],
  },
];

/** A line of the shopping list for the next market visit (ADR-0015). */
export interface ShoppingLineDef {
  article?: string;
  text?: string;
  quantity?: number;
  source: 'manual' | 'missing' | 'proposal';
  checked: boolean;
}

export const SHOPPING_LINES: readonly ShoppingLineDef[] = [
  { text: 'Servietten', source: 'manual', checked: false },
  { article: 'flour', quantity: 10_000, source: 'missing', checked: false },
  { article: 'rapeseedOil', quantity: 10_000, source: 'proposal', checked: true },
  { article: 'eggs', quantity: 30, source: 'proposal', checked: false },
  { article: 'sugar', quantity: 5000, source: 'manual', checked: false },
];
