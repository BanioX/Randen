import { allocateFefo } from '../domain/fefo';
import type { Requirement } from '../domain/requirements';
import { lineValue, roundQuantity } from '../domain/units';
import type { Id } from '../ids';
import { rappen, type Rappen } from '../money';
import { ArticleSchema } from '../model/article';
import type { DateKind, LocalDate } from '../model/primitives';
import {
  StockLotSchema,
  StockMovementSchema,
  type ConsumptionPurpose,
  type LotOrigin,
  type MovementType,
  type StockLot,
  type WasteReason,
} from '../model/stock';
import { alive } from '../ports/storage';
import { CommandError, requireRow, type AppContext } from './command';

/** How a new lot shows in the ledger: only bought goods count as a purchase. */
const RECEIPT_TYPE: Record<LotOrigin, MovementType> = {
  purchase: 'receipt',
  production: 'production',
  opening: 'adjustment',
  count: 'adjustment',
};

export interface ReceiveInput {
  businessId: Id;
  articleId: Id;
  areaId: Id;
  quantity: number;
  /** Rappen per 1000 base units. */
  pricePer1000: number;
  receivedOn: LocalDate;
  expiresOn?: LocalDate | undefined;
  /** Default: the article's date kind. */
  dateKind?: DateKind | undefined;
  lotCode?: string | undefined;
  supplierId?: Id | undefined;
  deliveryId?: Id | undefined;
  productionId?: Id | undefined;
  origin: LotOrigin;
  /** Remember this price on the article (default: yes for purchases and productions). */
  updateArticlePrice?: boolean | undefined;
}

export interface ConsumeInput {
  businessId: Id;
  articleId: Id;
  /** Gross quantity to take from stock, in base units. */
  quantity: number;
  on: LocalDate;
  purpose: ConsumptionPurpose;
  productionId?: Id | undefined;
  saleId?: Id | undefined;
  note?: string | undefined;
}

export interface ConsumeResult {
  consumed: number;
  /** What the stock could not cover; nothing is booked for it. */
  missing: number;
  /** Value of what was consumed (positive). */
  valueRappen: Rappen;
  picks: { lotId: Id; quantity: number; valueRappen: Rappen }[];
}

/**
 * The stock ledger (ADR-0007): the one place that changes lots. Every change of a quantity
 * writes a movement, so for every article the lots add up to what the ledger says, and budget,
 * food cost and waste can be read from the movements alone. Call these only inside a command
 * (`runCommand`): they rely on its transaction.
 */
export function createStockLedger(ctx: AppContext) {
  const { storage, clock, ids, actor } = ctx;

  /** Writes the new quantity of a lot and the movement that explains it. */
  async function book(
    lot: StockLot,
    newQuantity: number,
    type: MovementType,
    on: LocalDate,
    extra: {
      reason?: WasteReason | undefined;
      purpose?: ConsumptionPurpose | undefined;
      productionId?: Id | undefined;
      saleId?: Id | undefined;
      countId?: Id | undefined;
      note?: string | undefined;
    } = {},
  ): Promise<{ quantity: number; valueRappen: Rappen }> {
    const after = roundQuantity(newQuantity);
    const delta = roundQuantity(after - lot.quantity);
    // The value moves with the quantity; taking the difference of the lot's value before and
    // after means the movements of a lot add up to its value exactly, without rounding drift.
    const valueDelta = rappen(
      lineValue(after, lot.pricePer1000) - lineValue(lot.quantity, lot.pricePer1000),
    );
    const now = clock.now();
    await storage.lots.put(
      StockLotSchema.parse({
        ...lot,
        quantity: after,
        status: after > 0 ? 'active' : 'depleted',
        updatedAt: now,
      }),
    );
    await storage.movements.add(
      StockMovementSchema.parse({
        id: ids.next(),
        businessId: lot.businessId,
        lotId: lot.id,
        articleId: lot.articleId,
        type,
        quantity: delta,
        valueRappen: valueDelta,
        on,
        at: now,
        actor,
        ...(extra.reason === undefined ? {} : { reason: extra.reason }),
        ...(extra.purpose === undefined ? {} : { purpose: extra.purpose }),
        ...(extra.productionId === undefined ? {} : { productionId: extra.productionId }),
        ...(extra.saleId === undefined ? {} : { saleId: extra.saleId }),
        ...(extra.countId === undefined ? {} : { countId: extra.countId }),
        ...(extra.note === undefined ? {} : { note: extra.note }),
      }),
    );
    return { quantity: delta, valueRappen: valueDelta };
  }

  /** Active lots of a business, optionally of one article. */
  async function activeLots(businessId: Id, articleId?: Id): Promise<StockLot[]> {
    const lots = alive(await storage.lots.ofBusiness(businessId));
    return lots.filter(
      (lot) => lot.status === 'active' && (articleId === undefined || lot.articleId === articleId),
    );
  }

  /** Goods come in: a new lot and its receipt in the ledger. */
  async function receive(input: ReceiveInput): Promise<StockLot> {
    const article = await requireRow(
      storage.articles,
      input.businessId,
      input.articleId,
      'Article',
    );
    await requireRow(storage.areas, input.businessId, input.areaId, 'Area');
    const now = clock.now();
    const quantity = roundQuantity(input.quantity);
    const lot = StockLotSchema.parse({
      id: ids.next(),
      businessId: input.businessId,
      articleId: article.id,
      areaId: input.areaId,
      quantity,
      initialQuantity: quantity,
      pricePer1000: input.pricePer1000,
      receivedOn: input.receivedOn,
      ...(input.expiresOn === undefined ? {} : { expiresOn: input.expiresOn }),
      dateKind: input.dateKind ?? article.dateKind,
      ...(input.lotCode === undefined ? {} : { lotCode: input.lotCode }),
      ...(input.supplierId === undefined ? {} : { supplierId: input.supplierId }),
      ...(input.deliveryId === undefined ? {} : { deliveryId: input.deliveryId }),
      ...(input.productionId === undefined ? {} : { productionId: input.productionId }),
      origin: input.origin,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    });
    await storage.lots.add(lot);
    await storage.movements.add(
      StockMovementSchema.parse({
        id: ids.next(),
        businessId: lot.businessId,
        lotId: lot.id,
        articleId: lot.articleId,
        type: RECEIPT_TYPE[input.origin],
        quantity,
        valueRappen: lineValue(quantity, lot.pricePer1000),
        on: input.receivedOn,
        at: now,
        actor,
        ...(input.deliveryId === undefined ? {} : { deliveryId: input.deliveryId }),
        ...(input.productionId === undefined ? {} : { productionId: input.productionId }),
      }),
    );
    const remember =
      input.updateArticlePrice ?? (input.origin === 'purchase' || input.origin === 'production');
    if (remember && input.pricePer1000 > 0 && input.pricePer1000 !== article.pricePer1000) {
      await storage.articles.put(
        ArticleSchema.parse({ ...article, pricePer1000: input.pricePer1000, updatedAt: now }),
      );
    }
    return lot;
  }

  /**
   * Goods leave for the kitchen, first expired first out. Lots past their Verbrauchsdatum are
   * never used. Books what is there and reports the rest as `missing`; the caller decides
   * whether a shortage is an error.
   */
  async function consume(input: ConsumeInput): Promise<ConsumeResult> {
    const lots = await activeLots(input.businessId, input.articleId);
    const { picks, missing } = allocateFefo(lots, input.quantity, input.on);
    const byId = new Map(lots.map((lot) => [lot.id, lot]));
    const result: ConsumeResult = { consumed: 0, missing, valueRappen: rappen(0), picks: [] };
    for (const pick of picks) {
      const lot = byId.get(pick.lotId);
      if (lot === undefined) {
        continue;
      }
      const booked = await book(lot, lot.quantity - pick.quantity, 'consumption', input.on, {
        purpose: input.purpose,
        productionId: input.productionId,
        saleId: input.saleId,
        note: input.note,
      });
      const value = rappen(0 - booked.valueRappen);
      result.consumed = roundQuantity(result.consumed + pick.quantity);
      result.valueRappen = rappen(result.valueRappen + value);
      result.picks.push({ lotId: lot.id, quantity: pick.quantity, valueRappen: value });
    }
    return result;
  }

  /**
   * Takes everything a recipe needs (`recipeRequirements`) from stock. Books what is there and
   * lists the rest as shortages, so a kitchen that cooked anyway still gets its numbers.
   */
  async function consumeMany(
    requirements: readonly Requirement[],
    input: Omit<ConsumeInput, 'articleId' | 'quantity'>,
  ): Promise<{ valueRappen: Rappen; shortages: { articleId: Id; missing: number }[] }> {
    let value = 0;
    const shortages: { articleId: Id; missing: number }[] = [];
    for (const requirement of requirements) {
      if (requirement.quantity <= 0) {
        continue;
      }
      const result = await consume({
        ...input,
        articleId: requirement.articleId,
        quantity: requirement.quantity,
      });
      value += result.valueRappen;
      if (result.missing > 0) {
        shortages.push({ articleId: requirement.articleId, missing: result.missing });
      }
    }
    return { valueRappen: rappen(value), shortages };
  }

  async function lotWithAtLeast(businessId: Id, lotId: Id, quantity: number): Promise<StockLot> {
    const lot = await requireRow(storage.lots, businessId, lotId, 'Lot');
    if (quantity <= 0 || quantity > lot.quantity) {
      throw new CommandError(
        'invalid',
        `Lot ${lot.id} holds ${String(lot.quantity)}, cannot take ${String(quantity)}`,
      );
    }
    return lot;
  }

  /** Takes a quantity from one chosen lot (a withdrawal by hand). */
  async function consumeLot(input: {
    businessId: Id;
    lotId: Id;
    quantity: number;
    on: LocalDate;
    purpose: ConsumptionPurpose;
    note?: string | undefined;
  }): Promise<{ valueRappen: Rappen }> {
    const lot = await lotWithAtLeast(input.businessId, input.lotId, input.quantity);
    const booked = await book(lot, lot.quantity - input.quantity, 'consumption', input.on, {
      purpose: input.purpose,
      note: input.note,
    });
    return { valueRappen: rappen(0 - booked.valueRappen) };
  }

  /** Goods are written off («Abschreiber»): out of stock, into the waste figures, with a reason. */
  async function writeOff(input: {
    businessId: Id;
    lotId: Id;
    quantity: number;
    reason: WasteReason;
    on: LocalDate;
    note?: string | undefined;
  }): Promise<{ valueRappen: Rappen; articleId: Id }> {
    const lot = await lotWithAtLeast(input.businessId, input.lotId, input.quantity);
    const booked = await book(lot, lot.quantity - input.quantity, 'waste', input.on, {
      reason: input.reason,
      note: input.note,
    });
    return { valueRappen: rappen(0 - booked.valueRappen), articleId: lot.articleId };
  }

  /** A count says what is really there («Inventur»): the lot follows, the ledger explains. */
  async function adjust(input: {
    businessId: Id;
    lotId: Id;
    counted: number;
    on: LocalDate;
    countId?: Id | undefined;
    note?: string | undefined;
  }): Promise<{ delta: number; valueDeltaRappen: Rappen; lot: StockLot }> {
    const lot = await requireRow(storage.lots, input.businessId, input.lotId, 'Lot');
    if (input.counted < 0) {
      throw new CommandError('invalid', 'A counted quantity cannot be negative');
    }
    if (roundQuantity(input.counted) === lot.quantity) {
      return { delta: 0, valueDeltaRappen: rappen(0), lot };
    }
    const booked = await book(lot, input.counted, 'adjustment', input.on, {
      countId: input.countId,
      note: input.note,
    });
    return { delta: booked.quantity, valueDeltaRappen: booked.valueRappen, lot };
  }

  /**
   * Moves a lot, or a part of it, to another area. Nothing is gained or lost, so the ledger
   * gets no movement; a part becomes a lot of its own with the same date and price.
   */
  async function move(input: {
    businessId: Id;
    lotId: Id;
    areaId: Id;
    quantity?: number | undefined;
  }): Promise<{ lotId: Id }> {
    const lot = await requireRow(storage.lots, input.businessId, input.lotId, 'Lot');
    await requireRow(storage.areas, input.businessId, input.areaId, 'Area');
    const now = clock.now();
    const part = input.quantity === undefined ? lot.quantity : roundQuantity(input.quantity);
    if (part <= 0 || part > lot.quantity) {
      throw new CommandError('invalid', `Lot ${lot.id} holds ${String(lot.quantity)}`);
    }
    if (part === lot.quantity) {
      await storage.lots.put(
        StockLotSchema.parse({ ...lot, areaId: input.areaId, updatedAt: now }),
      );
      return { lotId: lot.id };
    }
    await storage.lots.put(
      StockLotSchema.parse({
        ...lot,
        quantity: roundQuantity(lot.quantity - part),
        updatedAt: now,
      }),
    );
    const moved = StockLotSchema.parse({
      ...lot,
      id: ids.next(),
      areaId: input.areaId,
      quantity: part,
      initialQuantity: part,
      createdAt: now,
      updatedAt: now,
    });
    await storage.lots.add(moved);
    return { lotId: moved.id };
  }

  return { activeLots, receive, consume, consumeMany, consumeLot, writeOff, adjust, move };
}

export type StockLedger = ReturnType<typeof createStockLedger>;
