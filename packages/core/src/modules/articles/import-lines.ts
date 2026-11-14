import { minorDigits, type CurrencyCode } from '../../currency';
import type { ArticleCategoryId } from '../../domain/categories';
import type { Unit } from '../../model/primitives';
import { foldName, guessCategory } from './category-guess';

/** How many lines «Mehrere auf einmal» takes in one go. */
export const IMPORT_MAX_LINES = 500;

/**
 * What keeps a pasted line from becoming an article:
 * `name` no name, or longer than 120 characters · `unit` no unit, or one the app does not know ·
 * `price` a price that cannot be read · `supplier` a supplier name longer than 80 characters ·
 * `duplicate` an article of this name exists · `repeated` the name stands further up in the list.
 */
export type ImportProblem = 'name' | 'unit' | 'price' | 'supplier' | 'duplicate' | 'repeated';

export interface ParsedImportLine {
  /** Number of the line in the pasted text, starting at 1. */
  line: number;
  /** The line as pasted. */
  raw: string;
  name?: string;
  unit?: Unit;
  /** Rappen per 1000 base units; absent when the line gives no price. */
  pricePer1000?: number;
  supplierName?: string;
  categoryId: ArticleCategoryId;
  problems: ImportProblem[];
}

export interface ParsedImport {
  lines: ParsedImportLine[];
  /** True when the text had more lines than `IMPORT_MAX_LINES`; the rest was not read. */
  truncated: boolean;
}

/** Units as people write them, with the base unit and how many base units one of them is. */
const TYPED_UNITS: Readonly<Record<string, { unit: Unit; factor: number }>> = {
  kg: { unit: 'g', factor: 1000 },
  kilo: { unit: 'g', factor: 1000 },
  g: { unit: 'g', factor: 1 },
  gr: { unit: 'g', factor: 1 },
  l: { unit: 'ml', factor: 1000 },
  lt: { unit: 'ml', factor: 1000 },
  liter: { unit: 'ml', factor: 1000 },
  dl: { unit: 'ml', factor: 100 },
  cl: { unit: 'ml', factor: 10 },
  ml: { unit: 'ml', factor: 1 },
  stk: { unit: 'pcs', factor: 1 },
  st: { unit: 'pcs', factor: 1 },
  stück: { unit: 'pcs', factor: 1 },
  stueck: { unit: 'pcs', factor: 1 },
  pcs: { unit: 'pcs', factor: 1 },
};

const HEADER_UNITS = new Set(['einheit', 'einh', 'masseinheit', 'unit']);

/** How a name is compared: «butter» and «Butter» are the same article. */
export function nameKey(name: string): string {
  return name.trim().toLocaleLowerCase('de-CH');
}

function readUnit(text: string): { unit: Unit; factor: number } | undefined {
  return TYPED_UNITS[foldName(text).replace(/\.$/, '')];
}

/**
 * A price as typed («62.00», «0,45», «CHF 1’250.50», «12.–») for one typed unit, turned into
 * the smallest currency unit per 1000 base units. Counted in whole ten-thousandths, so no
 * decimal is lost on the way. Returns undefined for anything that is not a plain amount.
 */
export function readImportPrice(
  text: string,
  factor: number,
  currency: CurrencyCode,
): number | undefined {
  const bare = text
    .trim()
    .replace(/^(?:chf|sfr\.?|fr\.?|eur|€|\$)\s*/i, '')
    .replace(/\s*(?:chf|fr\.?|eur|€)$/i, '')
    .replace(/[’'\u2009\u202f ]/g, '')
    .replace(/[.,][-–—]$/, '');
  const match = /^(\d{0,8})(?:[.,](\d{1,4}))?$/.exec(bare);
  const whole = match?.[1] ?? '';
  const fraction = match?.[2] ?? '';
  if (match === null || (whole === '' && fraction === '')) {
    return undefined;
  }
  const tenThousandths =
    Number(whole === '' ? '0' : whole) * 10_000 + Number(fraction.padEnd(4, '0'));
  // Major units → smallest units (× 10^digits), one typed unit → 1000 base units (× 1000 ÷ factor).
  const per1000 = Math.round((tenThousandths * 10 ** minorDigits(currency)) / (factor * 10));
  return Number.isSafeInteger(per1000) && per1000 <= 100_000_000_000 ? per1000 : undefined;
}

function cells(raw: string): string[] {
  const parts = raw.includes('\t') ? raw.split('\t') : raw.split(';');
  return parts.map((part) => part.trim());
}

/**
 * Reads pasted lines, one article per line: name; unit; price per unit; supplier. Cells are
 * separated by semicolons or, copied from a spreadsheet, by tabs. Price and supplier are
 * optional. Empty lines and a heading line («Name; Einheit; …») are left out. Pure: it knows
 * the names that exist only through `existingNames` (compared with `nameKey`).
 */
export function parseImportLines(
  text: string,
  currency: CurrencyCode,
  existingNames: ReadonlySet<string>,
): ParsedImport {
  const all = text.split(/\r\n|\r|\n/);
  const lines: ParsedImportLine[] = [];
  const seen = new Set<string>();
  let truncated = false;
  let first = true;
  for (const [index, raw] of all.entries()) {
    if (raw.trim() === '') {
      continue;
    }
    const [nameCell = '', unitCell = '', priceCell = '', supplierCell = ''] = cells(raw);
    if (first) {
      first = false;
      if (HEADER_UNITS.has(foldName(unitCell).replace(/\.$/, ''))) {
        continue;
      }
    }
    if (lines.length >= IMPORT_MAX_LINES) {
      truncated = true;
      break;
    }
    const problems: ImportProblem[] = [];
    const parsed: ParsedImportLine = {
      line: index + 1,
      raw,
      categoryId: guessCategory(nameCell),
      problems,
    };
    if (nameCell === '' || nameCell.length > 120) {
      problems.push('name');
    } else {
      parsed.name = nameCell;
    }
    const typed = readUnit(unitCell);
    if (typed === undefined) {
      problems.push('unit');
    } else {
      parsed.unit = typed.unit;
    }
    if (priceCell !== '') {
      const price = readImportPrice(priceCell, typed?.factor ?? 1, currency);
      if (price === undefined) {
        problems.push('price');
      } else if (typed !== undefined && price > 0) {
        parsed.pricePer1000 = price;
      }
    }
    if (supplierCell.length > 80) {
      problems.push('supplier');
    } else if (supplierCell !== '') {
      parsed.supplierName = supplierCell;
    }
    if (parsed.name !== undefined) {
      const key = nameKey(parsed.name);
      if (existingNames.has(key)) {
        problems.push('duplicate');
      } else if (seen.has(key)) {
        problems.push('repeated');
      }
      seen.add(key);
    }
    lines.push(parsed);
  }
  return { lines, truncated };
}
