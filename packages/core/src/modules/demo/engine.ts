import { mustNotUse } from '../../domain/expiry';
import { allocateFefo, fefoOrder } from '../../domain/fefo';
import { lineValue, roundQuantity, unitPriceFromTotal } from '../../domain/units';
import type { DateKind, LocalDate } from '../../model/primitives';
import type { ConsumptionPurpose, LotOrigin, WasteReason } from '../../model/stock';
import type { Id } from '../../ids';
import { rappen } from '../../money';
import {
  ARTICLES,
  STAFF_MEAL,
  SUPPLIERS,
  type AreaKey,
  type ArticleDef,
  type StaffKey,
  type SupplierKey,
} from './catalogue';
import {
  articleOf,
  COUNT_DAY,
  COUNT_DIFFERENCES,
  dayNeeds,
  demandOn,
  FORGOTTEN_LOTS,
  HISTORY_DAYS,
  isComponent,
  isDeliveryDay,
  keepsLong,
  must,
  orderStep,
  requirementsOf,
  SCRIPTED_WASTES,
  supplierByKey,
  type DemoPlan,
} from './plan';
import { counterIds, createRandom, dayAt, roundUpTo } from './support';

/**
 * Walks the 56 days of the demo history in date order: write-offs of what passed its date,
 * deliveries, productions, the day's sales and the staff meal, losses, the stock take. The
 * same walk runs twice. First on a mirror of the lots alone, to decide how much of the fresh
 * goods each delivery brought (a kitchen orders what it needs until the next delivery). Then
 * through the stock ledger with those decisions, so every quantity is booked as a movement.
 */

/** One lot as the walk sees it. */
export interface MirrorLot {
  id: Id;
  article: string;
  area: AreaKey;
  quantity: number;
  price: number;
  receivedOn: LocalDate;
  expiresOn?: LocalDate | undefined;
  dateKind: DateKind;
  /** Forgotten behind other packs: service does not find it, it expires. */
  hidden: boolean;
  /** Why a forgotten lot is written off. */
  note?: string | undefined;
  /** The first walk's extra on a story lot: not counted when the next order is decided. */
  reserve?: number | undefined;
  /** Stays past its date: the story of today wants it found, not cleared at closing. */
  keep?: boolean | undefined;
}

export interface ReceiveSpec {
  article: string;
  area: AreaKey;
  quantity: number;
  price: number;
  receivedOn: LocalDate;
  expiresOn?: LocalDate | undefined;
  dateKind: DateKind;
  origin: LotOrigin;
  supplier?: SupplierKey | undefined;
  deliveryId?: Id | undefined;
  productionId?: Id | undefined;
  lotCode?: string | undefined;
  by: StaffKey;
}

export interface Pick {
  lotId: Id;
  quantity: number;
  value: number;
}

/** Where the walk books: on the mirror only, or through the stock ledger. */
export interface Backend {
  newId: () => Id;
  receive: (spec: ReceiveSpec) => Promise<Id>;
  /** Takes goods for a production first expired first out, as the ledger does. */
  consumeForProduction: (input: {
    article: string;
    quantity: number;
    on: LocalDate;
    productionId: Id;
    by: StaffKey;
    lots: readonly MirrorLot[];
  }) => Promise<{ picks: Pick[]; missing: number }>;
  consumeLot: (input: {
    lot: MirrorLot;
    quantity: number;
    on: LocalDate;
    purpose: ConsumptionPurpose;
    note?: string | undefined;
    by: StaffKey;
  }) => Promise<number>;
  writeOff: (input: {
    lot: MirrorLot;
    quantity: number;
    on: LocalDate;
    reason: WasteReason;
    note?: string | undefined;
    by: StaffKey;
  }) => Promise<number>;
  adjust: (input: {
    lot: MirrorLot;
    counted: number;
    on: LocalDate;
    countId: Id;
    by: StaffKey;
  }) => Promise<number>;
}

/** A lot whose rest today is part of the story (due today, past its date). */
export interface StoryLot {
  day: number;
  article: string;
  /** What should be left of it today. */
  rest: number;
  /** Its date, as days from today, when not the usual one. */
  expiresIn?: number;
  /** A pack of its own that service did not find: it comes with the delivery and stays whole. */
  forgotten?: string;
}

export interface WalkInput {
  plan: DemoPlan;
  backend: Backend;
  /** Fresh goods per delivery, decided by the first walk (`day:article` → quantity). */
  decided?: ReadonlyMap<string, number>;
  /** The second walk: corrected quantities of the story lots. */
  story: readonly StoryLot[];
  /** The first walk adds this much to story lots so they never run out before today. */
  storyReserve: boolean;
}

export interface DeliveryRecord {
  id: Id;
  supplier: SupplierKey;
  day: number;
  documentNumber: string;
  tempDeciC?: number;
  by: StaffKey;
  lines: {
    article: string;
    lotId: Id;
    area: AreaKey;
    quantity: number;
    price: number;
    value: number;
    expiresOn?: LocalDate | undefined;
    lotCode?: string | undefined;
  }[];
}

export interface ProductionRecord {
  id: Id;
  recipe: string;
  portions: number;
  day: number;
  cost: number;
  outputLotId: Id;
  shortages: { article: string; missing: number }[];
  by: StaffKey;
}

export interface CountRecord {
  id: Id;
  day: number;
  lines: { lotId: Id; article: string; expected: number; counted: number; valueDelta: number }[];
  valueDelta: number;
  by: StaffKey;
}

export interface WalkResult {
  decided: Map<string, number>;
  deliveries: DeliveryRecord[];
  productions: ProductionRecord[];
  counts: CountRecord[];
  /** The lots as they stand at the end of yesterday. */
  lots: MirrorLot[];
  /** Rest of each story lot at the end of yesterday, by `day:article`. */
  storyRests: Map<string, number>;
  /** What service or a production needed and the stock did not have. */
  shortages: { day: number; article: string; missing: number }[];
}

const decisionKey = (day: number, article: string) => `${String(day)}:${article}`;
const LOT_PREFIX: Partial<Record<SupplierKey, string>> = {
  butcher: 'MM',
  fishmonger: 'CB',
  wholesale: 'GM',
};
/** Who books the sales of the day, and who clears out what passed its date. */
const SERVICE: StaffKey = 'ines';
const CLEARING: StaffKey = 'luca';

/** The price of goods on a day: changes and the weekly swing of fresh goods, today's price last. */
export function priceOn(article: ArticleDef, day: number): number {
  let price = article.price;
  if (article.priceChange !== undefined && day < article.priceChange.day) {
    price = Math.round((price * 10_000) / (10_000 + article.priceChange.bps));
  }
  const week = Math.floor((day + HISTORY_DAYS) / 7);
  if (article.swingBps !== undefined && day < -7) {
    const random = createRandom(
      article.key.length * 1009 + week * 97 + (article.key.codePointAt(0) ?? 0),
    );
    const swing = Math.round((random.next() * 2 - 1) * article.swingBps);
    price = Math.round((price * (10_000 + swing)) / 10_000);
  }
  return price;
}

/** The lot code printed on fresh goods: supplier, then the date of the delivery. */
function lotCodeOf(
  supplier: SupplierKey,
  date: LocalDate,
  article: ArticleDef,
): string | undefined {
  const prefix = LOT_PREFIX[supplier];
  if (prefix === undefined || keepsLong(article)) {
    return undefined;
  }
  return `${prefix}${date.slice(2, 4)}${date.slice(5, 7)}${date.slice(8, 10)}-${String((article.key.length % 7) + 1)}`;
}

/** Walks the history; see the comment at the top of the file. */
export async function walkHistory(input: WalkInput): Promise<WalkResult> {
  const { plan, backend } = input;
  const today = plan.today;
  const date = (day: number) => dayAt(today, day);
  const random = createRandom(4711);
  const lots = new Map<string, MirrorLot[]>(ARTICLES.map((article) => [article.key, []]));
  const result: WalkResult = {
    decided: new Map(input.decided ?? []),
    deliveries: [],
    productions: [],
    counts: [],
    lots: [],
    storyRests: new Map(),
    shortages: [],
  };
  const storyByKey = new Map(input.story.map((lot) => [decisionKey(lot.day, lot.article), lot]));
  const storyLots = new Map<string, MirrorLot>();
  const documentNumbers = new Map<SupplierKey, number>(
    SUPPLIERS.map((supplier, index) => [supplier.key, 4100 + index * 977]),
  );
  const lotsOf = (article: string) => must(lots.get(article), `lots of ${article}`);
  const usable = (lot: MirrorLot, on: LocalDate) =>
    lot.quantity > 0 && !mustNotUse(lot.expiresOn, lot.dateKind, on);

  /**
   * Books new lots, all at once: they are independent of each other, so their writes go out
   * together instead of one after the other (a phone's database answers each with a delay).
   */
  async function receiveAll(
    specs: readonly { spec: ReceiveSpec; hidden?: string | undefined }[],
  ): Promise<MirrorLot[]> {
    const ids = await Promise.all(specs.map(({ spec }) => backend.receive(spec)));
    return specs.map(({ spec, hidden }, index) => {
      const lot: MirrorLot = {
        id: must(ids[index], 'lot id'),
        article: spec.article,
        area: spec.area,
        quantity: roundQuantity(spec.quantity),
        price: spec.price,
        receivedOn: spec.receivedOn,
        expiresOn: spec.expiresOn,
        dateKind: spec.dateKind,
        hidden: hidden !== undefined,
        note: hidden,
      };
      lotsOf(spec.article).push(lot);
      return lot;
    });
  }

  function expiryOf(article: ArticleDef, day: number): LocalDate | undefined {
    if (article.noDate === true) {
      return undefined;
    }
    const shelf = article.shelfLifeDays ?? 7;
    // Packs of long-keeping goods were made a while before they came in.
    const offset = keepsLong(article)
      ? shelf - random.int(30, 90)
      : article.dateKind === 'best_before'
        ? shelf + random.int(0, 2)
        : shelf;
    return date(day + offset);
  }

  /**
   * Takes goods for service or the staff meal: first expired first out, hidden lots excepted.
   * The lots are chosen here, so the bookings of different articles go out together.
   */
  async function serveAll(
    day: number,
    needs: readonly (readonly [string, number])[],
    purpose: ConsumptionPurpose,
    by: StaffKey,
    note?: string,
  ) {
    const on = date(day);
    const bookings: Promise<number>[] = [];
    for (const [article, quantity] of needs) {
      const candidates = lotsOf(article).filter((lot) => !lot.hidden && lot.quantity > 0);
      const { picks, missing } = allocateFefo(candidates, quantity, on);
      for (const pick of picks) {
        const lot = must(
          candidates.find((candidate) => candidate.id === pick.lotId),
          'picked lot',
        );
        bookings.push(backend.consumeLot({ lot, quantity: pick.quantity, on, purpose, note, by }));
        lot.quantity = roundQuantity(lot.quantity - pick.quantity);
      }
      if (missing > 0) {
        result.shortages.push({ day, article, missing });
      }
    }
    await Promise.all(bookings);
  }

  /** Writes off parts of different lots together; each call is made before its lot changes. */
  async function writeOffAll(
    day: number,
    entries: readonly {
      lot: MirrorLot;
      quantity: number;
      reason: WasteReason;
      note: string | undefined;
      by: StaffKey;
    }[],
  ) {
    const bookings: Promise<number>[] = [];
    for (const { lot, quantity, reason, note, by } of entries) {
      const take = roundQuantity(Math.min(quantity, lot.quantity));
      if (take > 0) {
        bookings.push(backend.writeOff({ lot, quantity: take, on: date(day), reason, note, by }));
        lot.quantity = roundQuantity(lot.quantity - take);
      }
    }
    await Promise.all(bookings);
  }

  /** The first day new stock of an article comes in: a delivery, or a production. */
  function firstRefill(article: ArticleDef, from: number): number {
    if (isComponent(article)) {
      const made = plan.productions.find(
        (production) => production.recipe.output?.[0] === article.key,
      );
      return made?.day ?? from + 2;
    }
    const supplier = must(supplierByKey.get(must(article.supplier, 'supplier')), 'supplier');
    let day = from + 1;
    while (!isDeliveryDay(supplier, today, day) && day < from + 8) {
      day += 1;
    }
    return day;
  }

  /** The opening stock: what was there when the kitchen started with Randen. */
  async function opening() {
    const day = -HISTORY_DAYS;
    const specs: { spec: ReceiveSpec }[] = [];
    for (const article of ARTICLES) {
      const long = keepsLong(article);
      const until = long ? day : firstRefill(article, day);
      const quantity = long
        ? must(plan.longKeeping.get(article.key), `plan of ${article.key}`).opening
        : roundUpTo(
            demandOn(plan.demand, article.key, day, until) * 1.05,
            // Pieces stay whole: no half loaf in the opening stock.
            article.unit === 'pcs' ? 1 : orderStep(article) / 2,
          );
      if (quantity <= 0) {
        continue;
      }
      let expiresOn: LocalDate | undefined;
      if (article.noDate !== true) {
        expiresOn = long
          ? date(day + (article.shelfLifeDays ?? 365) - 120)
          : date(until + (article.dateKind === 'use_by' ? 0 : 2));
      }
      specs.push({
        spec: {
          article: article.key,
          area: article.area,
          quantity,
          price: isComponent(article) ? 0 : priceOn(article, day),
          receivedOn: date(day),
          expiresOn,
          dateKind: article.dateKind,
          origin: 'opening',
          by: 'mara',
        },
      });
    }
    await receiveAll(specs);
  }

  /** What a fresh article of `supplier` brings on `day`: enough until the next delivery. */
  function decide(article: ArticleDef, day: number): number {
    const key = decisionKey(day, article.key);
    const known = result.decided.get(key);
    if (known !== undefined) {
      return known;
    }
    const supplier = must(supplierByKey.get(must(article.supplier, 'supplier')), 'supplier');
    let next = day + 1;
    while (!isDeliveryDay(supplier, today, next) && next < day + 8) {
      next += 1;
    }
    const need = demandOn(plan.demand, article.key, day, next);
    const on = date(day);
    const have = lotsOf(article.key)
      .filter(
        (lot) =>
          !lot.hidden && usable(lot, on) && (lot.expiresOn === undefined || lot.expiresOn > on),
      )
      .reduce((sum, lot) => sum + Math.max(0, lot.quantity - (lot.reserve ?? 0)), 0);
    // Meat and fish are ordered tight, they are dear and keep only a few days.
    const tight = ['meat', 'poultry', 'fish'].includes(article.category);
    // Staples keep their minimum: what is left before the next delivery stays above it.
    const quantity = roundUpTo(
      need * (tight ? 1.04 : 1.12) +
        (article.minStock ?? 0) -
        have +
        (tight ? 0 : orderStep(article) * 0.25),
      orderStep(article),
    );
    result.decided.set(key, quantity);
    return quantity;
  }

  async function deliveries(day: number) {
    const booked: {
      record: DeliveryRecord;
      article: ArticleDef;
      spec: ReceiveSpec;
      hidden?: string | undefined;
      story?: { key: string; reserve?: number | undefined; keep: boolean } | undefined;
    }[] = [];
    for (const supplier of SUPPLIERS) {
      if (!isDeliveryDay(supplier, today, day)) {
        continue;
      }
      const lines: {
        article: ArticleDef;
        quantity: number;
        expiresOn: LocalDate | undefined;
        hidden?: string | undefined;
        story?: { key: string; reserve?: number | undefined; keep: boolean } | undefined;
      }[] = [];
      for (const article of ARTICLES) {
        if (article.supplier !== supplier.key || isComponent(article)) {
          continue;
        }
        if (keepsLong(article)) {
          const quantity = plan.longKeeping.get(article.key)?.deliveries.get(day) ?? 0;
          if (quantity > 0) {
            lines.push({ article, quantity, expiresOn: expiryOf(article, day) });
          }
          continue;
        }
        const key = decisionKey(day, article.key);
        const found = storyByKey.get(key);
        const story = found?.forgotten === undefined ? found : undefined;
        const reserve = story !== undefined && input.storyReserve ? 50 * orderStep(article) : 0;
        const quantity = decide(article, day) + reserve;
        if (quantity > 0) {
          lines.push({
            article,
            quantity,
            expiresOn:
              story?.expiresIn === undefined ? expiryOf(article, day) : date(story.expiresIn),
            ...(story === undefined
              ? {}
              : { story: { key, reserve, keep: (story.expiresIn ?? 0) < 0 } }),
          });
        }
      }
      for (const lot of FORGOTTEN_LOTS) {
        if (lot.supplier === supplier.key && firstDeliveryFrom(supplier.key, lot.fromDay) === day) {
          lines.push({
            article: articleOf(lot.article),
            quantity: lot.quantity,
            expiresOn: date(day + lot.keepsDays),
            hidden: lot.note,
          });
        }
      }
      for (const story of input.story) {
        if (
          story.forgotten !== undefined &&
          story.day === day &&
          articleOf(story.article).supplier === supplier.key
        ) {
          lines.push({
            article: articleOf(story.article),
            quantity: story.rest,
            expiresOn: date(story.expiresIn ?? 0),
            hidden: story.forgotten,
            story: { key: decisionKey(day, story.article), keep: true },
          });
        }
      }
      if (lines.length === 0) {
        continue;
      }
      const number = (documentNumbers.get(supplier.key) ?? 1000) + 1;
      documentNumbers.set(supplier.key, number);
      const record: DeliveryRecord = {
        id: backend.newId(),
        supplier: supplier.key,
        day,
        documentNumber: `${LOT_PREFIX[supplier.key] ?? 'LS'}-${String(number)}`,
        ...(supplier.chilled ? { tempDeciC: random.int(20, 44) } : {}),
        by: supplier.receiver,
        lines: [],
      };
      result.deliveries.push(record);
      for (const line of lines) {
        booked.push({
          record,
          article: line.article,
          hidden: line.hidden,
          story: line.story,
          spec: {
            article: line.article.key,
            area: line.article.area,
            quantity: line.quantity,
            price: priceOn(line.article, day),
            receivedOn: date(day),
            expiresOn: line.expiresOn,
            dateKind: line.article.dateKind,
            origin: 'purchase',
            supplier: supplier.key,
            deliveryId: record.id,
            lotCode: lotCodeOf(supplier.key, date(day), line.article),
            by: record.by,
          },
        });
      }
    }
    // All lines of all deliveries of the day go to the database together.
    const lots = await receiveAll(booked.map(({ spec, hidden }) => ({ spec, hidden })));
    booked.forEach(({ record, article, spec, story }, index) => {
      const lot = must(lots[index], 'delivered lot');
      record.lines.push({
        article: article.key,
        lotId: lot.id,
        area: article.area,
        quantity: lot.quantity,
        price: spec.price,
        value: lineValue(lot.quantity, spec.price),
        expiresOn: spec.expiresOn,
        lotCode: spec.lotCode,
      });
      if (story !== undefined) {
        lot.reserve = story.reserve;
        lot.keep = story.keep;
        storyLots.set(story.key, lot);
      }
    });
  }

  function firstDeliveryFrom(supplier: SupplierKey, from: number): number | undefined {
    const def = must(supplierByKey.get(supplier), supplier);
    for (let day = from; day < 0; day += 1) {
      if (isDeliveryDay(def, today, day)) {
        return day;
      }
    }
    return undefined;
  }

  async function productions(day: number) {
    for (const planned of plan.productions.filter((production) => production.day === day)) {
      const recipe = planned.recipe;
      const [outputKey, outputQuantity] = must(recipe.output, 'output');
      const productionId = backend.newId();
      const on = date(day);
      let cost = 0;
      const shortages: ProductionRecord['shortages'] = [];
      // The ingredients are different articles: their lots are taken together.
      const needs = [...requirementsOf(recipe.ingredients, planned.portions / recipe.portions)];
      const taken = await Promise.all(
        needs.map(([article, quantity]) =>
          backend.consumeForProduction({
            article,
            quantity,
            on,
            productionId,
            by: planned.by,
            lots: lotsOf(article).filter((lot) => lot.quantity > 0),
          }),
        ),
      );
      needs.forEach(([article], index) => {
        const { picks, missing } = must(taken[index], 'taken');
        const own = lotsOf(article);
        for (const pick of picks) {
          const lot = must(
            own.find((candidate) => candidate.id === pick.lotId),
            'picked lot',
          );
          lot.quantity = roundQuantity(lot.quantity - pick.quantity);
          cost += pick.value;
        }
        if (missing > 0) {
          shortages.push({ article, missing });
          result.shortages.push({ day, article, missing });
        }
      });
      const output = articleOf(outputKey);
      const quantity = roundQuantity(outputQuantity * planned.portions);
      const [lot] = await receiveAll([
        {
          spec: {
            article: outputKey,
            area: output.area,
            quantity,
            price: unitPriceFromTotal(rappen(cost), quantity),
            receivedOn: on,
            expiresOn: date(day + (recipe.shelfLifeDays ?? output.shelfLifeDays ?? 2)),
            dateKind: 'use_by',
            origin: 'production',
            productionId,
            by: planned.by,
          },
        },
      ]);
      result.productions.push({
        id: productionId,
        recipe: recipe.key,
        portions: planned.portions,
        day,
        cost,
        outputLotId: must(lot, 'output lot').id,
        shortages,
        by: planned.by,
      });
    }
  }

  /**
   * Goods past their best-before date by more than two days, and forgotten packs, are cleared
   * out in the morning; what reaches its use-by date is thrown away at closing that evening.
   */
  async function clearExpired(day: number, evening: boolean) {
    const on = date(day);
    const due: Parameters<typeof writeOffAll>[1][number][] = [];
    for (const article of ARTICLES) {
      for (const lot of fefoOrder(lotsOf(article.key))) {
        if (lot.quantity <= 0 || lot.expiresOn === undefined || lot.keep === true) {
          continue;
        }
        const past = evening
          ? lot.dateKind === 'use_by' && lot.expiresOn <= on
          : lot.dateKind === 'best_before' && lot.expiresOn < date(day - 2) && !keepsLong(article);
        if (past) {
          due.push({
            lot,
            quantity: lot.quantity,
            reason: 'expired',
            note: lot.note,
            by: CLEARING,
          });
        }
      }
    }
    await writeOffAll(day, due);
  }

  async function service(day: number) {
    const needs = dayNeeds(must(plan.sales.get(day), `sales of ${String(day)}`));
    await serveAll(
      day,
      ARTICLES.map((article): [string, number] => [
        article.key,
        needs.get(article.key) ?? 0,
      ]).filter(([, quantity]) => quantity > 0),
      'sale',
      SERVICE,
    );
    // After the service: the staff meal may take from the same lots.
    await serveAll(day, [...requirementsOf(STAFF_MEAL, 1)], 'staff', CLEARING, 'Personalessen');
  }

  async function losses(day: number) {
    const on = date(day);
    const entries: Parameters<typeof writeOffAll>[1][number][] = [];
    for (const waste of SCRIPTED_WASTES.filter((entry) => entry.day === day)) {
      const lot = fefoOrder(lotsOf(waste.article)).find(
        (candidate) => !candidate.hidden && usable(candidate, on),
      );
      if (lot !== undefined) {
        entries.push({
          lot,
          quantity: waste.quantity,
          reason: waste.reason,
          note: waste.note,
          by: waste.by,
        });
      }
    }
    await writeOffAll(day, entries);
  }

  async function stockTake(day: number) {
    const on = date(day);
    const countId = backend.newId();
    const record: CountRecord = { id: countId, day, lines: [], valueDelta: 0, by: 'mara' };
    const differences = new Map(COUNT_DIFFERENCES);
    const adjustments: Promise<number>[] = [];
    for (const article of ARTICLES) {
      const own = fefoOrder(lotsOf(article.key)).filter((lot) => lot.quantity > 0);
      for (const [index, lot] of own.entries()) {
        const delta = index === 0 ? (differences.get(article.key) ?? 0) : 0;
        const counted = roundQuantity(Math.max(0, lot.quantity + delta));
        adjustments.push(
          counted === lot.quantity
            ? Promise.resolve(0)
            : backend.adjust({ lot, counted, on, countId, by: record.by }),
        );
        record.lines.push({
          lotId: lot.id,
          article: article.key,
          expected: lot.quantity,
          counted,
          valueDelta: 0,
        });
        lot.quantity = counted;
      }
    }
    const values = await Promise.all(adjustments);
    record.lines.forEach((line, index) => {
      line.valueDelta = values[index] ?? 0;
      record.valueDelta += line.valueDelta;
    });
    result.counts.push(record);
  }

  await opening();
  for (let day = -HISTORY_DAYS; day < 0; day += 1) {
    await clearExpired(day, false);
    await deliveries(day);
    await productions(day);
    await service(day);
    await losses(day);
    if (day === COUNT_DAY) {
      await stockTake(day);
    }
    await clearExpired(day, true);
  }

  for (const [key, lot] of storyLots) {
    result.storyRests.set(key, lot.quantity);
  }
  result.lots = [...lots.values()].flat();
  return result;
}

/** The mirror alone: the same arithmetic as the stock ledger, without storage. */
export function mirrorBackend(): Backend {
  const ids = counterIds();
  const value = (lot: MirrorLot, after: number) =>
    lineValue(after, lot.price) - lineValue(lot.quantity, lot.price);
  return {
    newId: ids,
    receive: () => Promise.resolve(ids()),
    consumeForProduction: ({ quantity, on, lots }) => {
      const { picks, missing } = allocateFefo(lots, quantity, on);
      return Promise.resolve({
        picks: picks.map((pick) => {
          const lot = must(
            lots.find((candidate) => candidate.id === pick.lotId),
            'lot',
          );
          return { ...pick, value: -value(lot, roundQuantity(lot.quantity - pick.quantity)) };
        }),
        missing,
      });
    },
    consumeLot: ({ lot, quantity }) =>
      Promise.resolve(-value(lot, roundQuantity(lot.quantity - quantity))),
    writeOff: ({ lot, quantity }) =>
      Promise.resolve(-value(lot, roundQuantity(lot.quantity - quantity))),
    adjust: ({ lot, counted }) => Promise.resolve(value(lot, counted)),
  };
}

/** The story of today: which lots are due today or past their date, and what is left of them. */
export function storyLots(plan: DemoPlan): StoryLot[] {
  const today = plan.today;
  const days = (supplier: SupplierKey) => {
    const def = must(supplierByKey.get(supplier), supplier);
    const list: number[] = [];
    for (let day = -1; day >= -HISTORY_DAYS; day -= 1) {
      if (isDeliveryDay(def, today, day)) {
        list.push(day);
      }
    }
    return list;
  };
  const fish = must(days('fishmonger')[0], 'fish delivery');
  const butcher = must(days('butcher')[1], 'butcher delivery');
  return [
    // Salmon of the last delivery is due today: «Heute verwerten».
    { day: fish, article: 'salmon', rest: 1500, expiresIn: 0 },
    // A pack of chicken of the delivery before was forgotten and passed its date yesterday.
    {
      day: butcher,
      article: 'chicken',
      rest: 600,
      expiresIn: -1,
      forgotten: 'Hinten im Regal vergessen.',
    },
    // Bread of the day before yesterday is due today.
    { day: -2, article: 'ciabatta', rest: 4, expiresIn: 0 },
  ];
}
