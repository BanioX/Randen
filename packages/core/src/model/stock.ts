import { z } from 'zod';
import { IdSchema } from '../ids';
import { RappenSchema } from '../money';
import { UnitPriceSchema } from './article';
import {
  DateKindSchema,
  DeciCelsiusSchema,
  IsoDateTimeSchema,
  LocalDateSchema,
  nameSchema,
  PositiveQuantitySchema,
  QuantityDeltaSchema,
  QuantitySchema,
  syncFields,
  textSchema,
} from './primitives';

/** How a lot came into the house. */
export const LotOriginSchema = z.enum(['purchase', 'production', 'opening', 'count']);
export type LotOrigin = z.infer<typeof LotOriginSchema>;

/**
 * One batch of an article in one area («Charge»): its own date, price and quantity. Stock is
 * the sum of the active lots; goods leave by first expired, first out (`domain/fefo.ts`).
 */
export const StockLotSchema = z.object({
  ...syncFields,
  articleId: IdSchema,
  areaId: IdSchema,
  quantity: QuantitySchema,
  initialQuantity: PositiveQuantitySchema,
  /** What this batch cost, per 1000 base units; the value of the lot follows from it. */
  pricePer1000: UnitPriceSchema,
  receivedOn: LocalDateSchema,
  /** No date: goods that do not expire in practice (salt, spirits). */
  expiresOn: LocalDateSchema.optional(),
  dateKind: DateKindSchema,
  lotCode: nameSchema(40).optional(),
  supplierId: IdSchema.optional(),
  deliveryId: IdSchema.optional(),
  productionId: IdSchema.optional(),
  origin: LotOriginSchema,
  status: z.enum(['active', 'depleted']),
});
export type StockLot = z.infer<typeof StockLotSchema>;

export const MovementTypeSchema = z.enum(['receipt', 'consumption', 'waste', 'adjustment']);
export type MovementType = z.infer<typeof MovementTypeSchema>;

/** Why goods were written off («Abschreiber»). */
export const WasteReasonSchema = z.enum([
  'expired',
  'spoiled',
  'overproduction',
  'prep_waste',
  'plate_waste',
  'damaged',
  'other',
]);
export type WasteReason = z.infer<typeof WasteReasonSchema>;
export const WASTE_REASONS = WasteReasonSchema.options;

export function wasteReasonLabel(reason: WasteReason): string {
  return {
    expired: 'Abgelaufen',
    spoiled: 'Verdorben',
    overproduction: 'Überproduktion',
    prep_waste: 'Rüstabfall',
    plate_waste: 'Tellerrest',
    damaged: 'Beschädigt',
    other: 'Anderes',
  }[reason];
}

/** What consumed goods were used for. */
export const ConsumptionPurposeSchema = z.enum(['production', 'sale', 'kitchen', 'staff']);
export type ConsumptionPurpose = z.infer<typeof ConsumptionPurposeSchema>;

/**
 * One line of the stock ledger («Lagerbewegung»). Append-only: for every article the quantities
 * of its lots add up to the quantities of its movements. Dashboards, budget and food cost read
 * the ledger, never the lots.
 */
export const StockMovementSchema = z.object({
  id: IdSchema,
  businessId: IdSchema,
  lotId: IdSchema,
  articleId: IdSchema,
  type: MovementTypeSchema,
  /** Signed change in base units: receipts are positive, consumption and waste negative. */
  quantity: QuantityDeltaSchema,
  /** Signed change of the stock value, in the smallest currency unit. */
  valueRappen: RappenSchema,
  on: LocalDateSchema,
  at: IsoDateTimeSchema,
  actor: IdSchema,
  reason: WasteReasonSchema.optional(),
  purpose: ConsumptionPurposeSchema.optional(),
  deliveryId: IdSchema.optional(),
  productionId: IdSchema.optional(),
  saleId: IdSchema.optional(),
  countId: IdSchema.optional(),
  note: textSchema(300).optional(),
});
export type StockMovement = z.infer<typeof StockMovementSchema>;

export const DeliveryLineSchema = z.object({
  articleId: IdSchema,
  lotId: IdSchema,
  areaId: IdSchema,
  quantity: PositiveQuantitySchema,
  pricePer1000: UnitPriceSchema,
  valueRappen: RappenSchema.min(0),
  expiresOn: LocalDateSchema.optional(),
  lotCode: nameSchema(40).optional(),
});
export type DeliveryLine = z.infer<typeof DeliveryLineSchema>;

/**
 * Goods received («Wareneingang»): one delivery note with its lines. The check at the door
 * (temperature, state) is part of the self-control.
 */
export const DeliverySchema = z.object({
  ...syncFields,
  supplierId: IdSchema.optional(),
  orderId: IdSchema.optional(),
  receivedOn: LocalDateSchema,
  documentNumber: nameSchema(40).optional(),
  lines: z.array(DeliveryLineSchema).min(1).max(200),
  totalRappen: RappenSchema.min(0),
  /** Temperature measured at the door, and whether the goods were accepted as in order. */
  tempDeciC: DeciCelsiusSchema.optional(),
  checkOk: z.boolean(),
  note: textSchema(500).optional(),
  receivedBy: IdSchema,
});
export type Delivery = z.infer<typeof DeliverySchema>;

export const OrderLineSchema = z.object({
  articleId: IdSchema,
  quantity: PositiveQuantitySchema,
  pricePer1000: UnitPriceSchema,
});
export type OrderLine = z.infer<typeof OrderLineSchema>;

export const OrderStatusSchema = z.enum(['draft', 'sent', 'received', 'cancelled']);
export type OrderStatus = z.infer<typeof OrderStatusSchema>;

/**
 * An order to one supplier («Bestellung»). The app only writes it; sending is a deliberate act
 * of the user (copy, share, print). No supplier system is connected.
 */
export const PurchaseOrderSchema = z.object({
  ...syncFields,
  supplierId: IdSchema,
  status: OrderStatusSchema,
  lines: z.array(OrderLineSchema).min(1).max(200),
  orderedOn: LocalDateSchema.optional(),
  expectedOn: LocalDateSchema.optional(),
  deliveryId: IdSchema.optional(),
  note: textSchema(500).optional(),
});
export type PurchaseOrder = z.infer<typeof PurchaseOrderSchema>;

export const CountLineSchema = z.object({
  lotId: IdSchema,
  articleId: IdSchema,
  expected: QuantitySchema,
  counted: QuantitySchema,
  valueDeltaRappen: RappenSchema,
});

/** A finished stock take («Inventur»): what was expected, what was counted, what it changed. */
export const InventoryCountSchema = z.object({
  ...syncFields,
  countedOn: LocalDateSchema,
  areaId: IdSchema.optional(),
  lines: z.array(CountLineSchema).min(1).max(2000),
  valueDeltaRappen: RappenSchema,
  countedBy: IdSchema,
  note: textSchema(500).optional(),
});
export type InventoryCount = z.infer<typeof InventoryCountSchema>;
