import { z } from 'zod';
import { IdSchema } from '../ids';

/** A calendar day in Europe/Zurich, `YYYY-MM-DD`. Used for expiry, delivery and production days. */
export const LocalDateSchema = z.iso.date().brand<'LocalDate'>();
export type LocalDate = z.infer<typeof LocalDateSchema>;

/** An instant in UTC, ISO 8601 with `Z`, e.g. `2026-11-14T15:00:00.000Z`. */
export const IsoDateTimeSchema = z.iso.datetime().brand<'IsoDateTime'>();
export type IsoDateTime = z.infer<typeof IsoDateTimeSchema>;

/** A calendar month `YYYY-MM`, the period of a budget. */
export const YearMonthSchema = z
  .string()
  .regex(/^\d{4}-(?:0[1-9]|1[0-2])$/, 'Expected YYYY-MM')
  .brand<'YearMonth'>();
export type YearMonth = z.infer<typeof YearMonthSchema>;

/** Base units of every quantity: grams, millilitres, pieces. Display units (kg, l, dl) derive. */
export const UnitSchema = z.enum(['g', 'ml', 'pcs']);
export type Unit = z.infer<typeof UnitSchema>;
export const UNITS = UnitSchema.options;

const hasAtMostThreeDecimals = (value: number) =>
  Math.abs(value * 1000 - Math.round(value * 1000)) < 1e-6;
/** 0.1 + 0.2 is stored as 0.3: sums of quantities never carry float noise into the data. */
const withoutFloatNoise = (value: number) => Math.round(value * 1000) / 1000;

/**
 * A quantity in base units with at most three decimals («2.5 g Safran», «0.5 Zitrone»).
 * Quantities are not money: they may be fractional, amounts of money never are (ADR-0004).
 */
export const QuantitySchema = z
  .number()
  .min(0)
  .max(1_000_000_000)
  .refine(hasAtMostThreeDecimals, 'At most three decimals')
  .overwrite(withoutFloatNoise);
export const PositiveQuantitySchema = QuantitySchema.refine((value) => value > 0, 'Must be > 0');
/** A signed change of a quantity (stock movements). */
export const QuantityDeltaSchema = z
  .number()
  .min(-1_000_000_000)
  .max(1_000_000_000)
  .refine(hasAtMostThreeDecimals, 'At most three decimals')
  .overwrite(withoutFloatNoise);

/** A share in basis points: 10000 = 100 %, 810 = 8.1 %. Whole numbers only. */
export const BpsSchema = z.int().min(0).max(10_000);
export type Bps = z.infer<typeof BpsSchema>;

/** A temperature in tenths of a degree Celsius: 45 = 4.5 °C, -180 = -18 °C. */
export const DeciCelsiusSchema = z.int().min(-800).max(3000);
export type DeciCelsius = z.infer<typeof DeciCelsiusSchema>;

/**
 * best_before = Mindesthaltbarkeitsdatum («mindestens haltbar bis»): often still good afterwards.
 * use_by = Verbrauchsdatum («zu verbrauchen bis»): must not be used or served after the date.
 */
export const DateKindSchema = z.enum(['best_before', 'use_by']);
export type DateKind = z.infer<typeof DateKindSchema>;

/**
 * A picture kept on the device as a data URL (ADR-0006): compressed JPEG from the camera, or an
 * SVG drawing of the demo data. It travels only in export and import.
 */
export const PhotoSchema = z
  .string()
  .regex(/^data:image\/(?:jpeg|png|webp|svg\+xml)[;,]/, 'Expected an image data URL')
  .max(700_000);
export type Photo = z.infer<typeof PhotoSchema>;

/** ISO 3166-1 alpha-2 country of origin, e.g. `CH`, `IE`, `NO`. */
export const CountryCodeSchema = z.string().regex(/^[A-Z]{2}$/, 'Expected a country code');
export type CountryCode = z.infer<typeof CountryCodeSchema>;

export const WeekdaySchema = z.enum(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']);
export type Weekday = z.infer<typeof WeekdaySchema>;
export const WEEKDAYS = WeekdaySchema.options;

/** Short text typed by a person: trimmed, never empty. */
export const nameSchema = (max = 120) => z.string().trim().min(1).max(max);
/** Longer free text (notes, descriptions); may be empty only if optional. */
export const textSchema = (max = 2000) => z.string().trim().min(1).max(max);

/** Validates a GTIN-8/12/13/14 (EAN/UPC) including its check digit. */
export function isValidGtin(value: string): boolean {
  if (!/^(?:\d{8}|\d{12,14})$/.test(value)) {
    return false;
  }
  const digits = Array.from(value, Number);
  const check = digits.pop();
  const sum = digits
    .reverse()
    .reduce((total, digit, index) => total + digit * (index % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === check;
}

export const GtinSchema = z.string().refine(isValidGtin, 'Invalid GTIN/EAN').brand<'Gtin'>();
export type Gtin = z.infer<typeof GtinSchema>;

/**
 * Fields every synced row carries (ADR-0003): a UUIDv7 made on the device, the business it
 * belongs to, and soft delete. Rows are never removed, so a later sync can tell «deleted» from
 * «never seen».
 */
export const syncFields = {
  id: IdSchema,
  businessId: IdSchema,
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
  deletedAt: IsoDateTimeSchema.optional(),
};
