import { formatMoney, minorDigits, type CurrencyCode } from '../currency';
import { formatDecimal } from '../format';
import { rappen, type Rappen } from '../money';
import type { Unit } from '../model/primitives';

/** Rounds a quantity to the three decimals the model keeps; removes float noise after sums. */
export function roundQuantity(value: number): number {
  const rounded = Math.round(value * 1000) / 1000;
  return rounded === 0 ? 0 : rounded;
}

/** The unit prices are quoted for: a kilogram, a litre, a piece. */
export function priceUnitLabel(unit: Unit): string {
  return { g: 'kg', ml: 'l', pcs: 'Stk.' }[unit];
}

/** The base unit as people write it. */
export function unitLabel(unit: Unit): string {
  return { g: 'g', ml: 'ml', pcs: 'Stk.' }[unit];
}

/**
 * A quantity as a kitchen writes it: `750 g`, `2.5 kg`, `1.2 l`, `12 Stk.`. `style: 'kitchen'`
 * uses decilitres for recipes (`2.5 dl`), as on Swiss recipe cards.
 */
export function formatQuantity(
  quantity: number,
  unit: Unit,
  options: { style?: 'stock' | 'kitchen' } = {},
): string {
  const value = roundQuantity(quantity);
  const abs = Math.abs(value);
  if (unit === 'pcs') {
    return `${formatDecimal(value, { digits: 2 })} Stk.`;
  }
  if (unit === 'g') {
    return abs >= 1000
      ? `${formatDecimal(value / 1000, { digits: 3 })} kg`
      : `${formatDecimal(value, { digits: 1 })} g`;
  }
  if (abs >= 1000) {
    return `${formatDecimal(value / 1000, { digits: 3 })} l`;
  }
  if (options.style === 'kitchen' && abs >= 100 && Math.round(abs) % 50 === 0) {
    return `${formatDecimal(value / 100, { digits: 1 })} dl`;
  }
  return `${formatDecimal(value, { digits: 1 })} ml`;
}

const NUMBER = /^(\d+(?:[.,]\d+)?|[.,]\d+)\s*([a-zA-Zäöü.]*)$/;

/** Factors from a typed unit to the base unit. */
const FACTORS: Record<Unit, Readonly<Record<string, number>>> = {
  g: { '': 1, g: 1, gr: 1, kg: 1000, mg: 0.001, t: 1_000_000 },
  ml: { '': 1, ml: 1, cl: 10, dl: 100, l: 1000 },
  pcs: { '': 1, stk: 1, 'stk.': 1, st: 1, 'st.': 1, stück: 1, x: 1 },
};

/**
 * Reads a quantity typed by a person into base units: `2.5 kg`, `750`, `7,5 dl`, `12 Stk.`.
 * A bare number is `fallback` (default: the base unit; a field labelled «kg» passes `kg`).
 * Returns null for anything that is not a non-negative amount of this unit.
 */
export function parseQuantityInput(input: string, unit: Unit, fallback = ''): number | null {
  const match = NUMBER.exec(input.trim().replace(/[’'\u2009\u202f]/g, ''));
  if (match === null) {
    return null;
  }
  const typedUnit = (match[2] ?? '').toLowerCase();
  const factor = FACTORS[unit][typedUnit === '' ? fallback.toLowerCase() : typedUnit];
  if (factor === undefined) {
    return null;
  }
  const value = Number.parseFloat((match[1] ?? '').replace(',', '.')) * factor;
  if (!Number.isFinite(value) || value > 1_000_000_000) {
    return null;
  }
  return roundQuantity(value);
}

/**
 * The value of a quantity at a unit price, in thousandths of the smallest currency unit.
 * `pricePer1000` is Rappen per 1000 base units, so quantity × price is exactly that; one
 * rounding per line, whole numbers from there on.
 */
export function valueMilli(quantity: number, pricePer1000: number): number {
  return Math.round(quantity * pricePer1000);
}

/** Thousandths back to the smallest currency unit, rounded half away from zero. */
export function milliToRappen(milli: number): Rappen {
  const rounded = Math.sign(milli) * Math.round(Math.abs(milli) / 1000);
  return rappen(rounded === 0 ? 0 : rounded);
}

/** The value of a quantity at a unit price, in the smallest currency unit. */
export function lineValue(quantity: number, pricePer1000: number): Rappen {
  return milliToRappen(valueMilli(quantity, pricePer1000));
}

/** The unit price that makes `quantity` cost `total`; 0 if there is no quantity. */
export function unitPriceFromTotal(total: Rappen, quantity: number): Rappen {
  if (quantity <= 0) {
    return rappen(0);
  }
  return rappen(Math.round((total * 1000) / quantity));
}

/**
 * A unit price as people read it: `CHF 52.00 / kg`, `CHF 2.40 / l`, `CHF 0.45 / Stk.`.
 * Prices per piece under one franc show up to four decimals, so `CHF 0.012 / Stk.` stays true.
 */
export function formatUnitPrice(
  pricePer1000: number,
  unit: Unit,
  currency: CurrencyCode,
  options: { currency?: boolean } = {},
): string {
  const suffix = ` / ${priceUnitLabel(unit)}`;
  if (unit !== 'pcs') {
    return `${formatMoney(rappen(Math.round(pricePer1000)), currency, options)}${suffix}`;
  }
  const digits = minorDigits(currency);
  const perPiece = pricePer1000 / 1000; // smallest currency units per piece, may be fractional
  if (Number.isInteger(perPiece)) {
    return `${formatMoney(rappen(perPiece), currency, options)}${suffix}`;
  }
  const major = perPiece / 10 ** digits;
  const number = formatDecimal(major, { digits: digits + 2 });
  const withSymbol = options.currency ?? true;
  return `${withSymbol ? `${currency} ` : ''}${number}${suffix}`;
}

/**
 * Reads a unit price typed in the major currency unit («52», «52.50», «0.012») into
 * `pricePer1000`. `unit` decides what the number refers to: per kg, per litre or per piece.
 */
export function parseUnitPrice(input: string, unit: Unit, currency: CurrencyCode): Rappen | null {
  const text = input
    .trim()
    .replace(/^[A-Za-z€$]+\s*/, '')
    .replace(/[’'\u2009\u202f ]/g, '')
    .replace(',', '.');
  if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(text)) {
    return null;
  }
  const major = Number.parseFloat(text);
  const minor = major * 10 ** minorDigits(currency);
  const per1000 = unit === 'pcs' ? minor * 1000 : minor;
  const rounded = Math.round(per1000);
  if (!Number.isSafeInteger(rounded) || rounded > 100_000_000_000) {
    return null;
  }
  return rappen(rounded);
}

/** A share in basis points as text: 3000 → `30 %`, 810 → `8.1 %`. */
export function formatPercent(bps: number, options: { digits?: number } = {}): string {
  return `${formatDecimal(bps / 100, { digits: options.digits ?? 1 })} %`;
}

/** A temperature in tenths of a degree: 45 → `4.5 °C`, -180 → `-18 °C`. */
export function formatTemperature(deciC: number): string {
  return `${formatDecimal(deciC / 10, { digits: 1 })} °C`;
}

/** Reads a typed temperature («4.5», «-18», «4,5 °C») into tenths of a degree. */
export function parseTemperature(input: string): number | null {
  const text = input
    .trim()
    .replace(/\s*°?\s*[cC]$/, '')
    .replace(',', '.')
    .replace('−', '-');
  if (!/^-?(?:\d+(?:\.\d)?|\.\d)$/.test(text)) {
    return null;
  }
  const value = Math.round(Number.parseFloat(text) * 10);
  return value < -800 || value > 3000 ? null : value;
}
