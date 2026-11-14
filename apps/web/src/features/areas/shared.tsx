import { formatQuantity, formatTemperature, type AreaKind, type Unit } from '@randen/core';
import { useEffect, useState, type RefObject } from 'react';
import { paths } from '../../app/paths';
import { areasMessages } from './messages';

const t = areasMessages;

/**
 * Addresses inside «Wo ist was?» that carry a query. They build on `paths`, so the path itself
 * still lives in one place; only the query part is ours.
 */
export const areaLinks = {
  /** The search with a text typed in. */
  where: (text: string) =>
    text.trim() === '' ? paths.where() : `${paths.where()}?q=${encodeURIComponent(text.trim())}`,
  /** An area with the sheet of one spot open: «Foto hinzufügen» from the tour. */
  editSpot: (areaId: string, spotId: string) => `${paths.area(areaId)}?spot=${spotId}`,
  /** An area with the sheet for a new spot open: «Platz erfassen» from the tour. */
  newSpot: (areaId: string) => `${paths.area(areaId)}?spot=new`,
  /** One stop of the tour, counted from 1. */
  tourStep: (step: number) => `${paths.tour()}?step=${String(step)}`,
  /** The stock list narrowed to one area: where its lots can be moved or written off. */
  stockOfArea: (areaId: string) => `${paths.stock()}?area=${areaId}`,
} as const;

/** «0 bis 5 °C», «höchstens -18 °C», or nothing when the area has no range. */
export function rangeText(range: {
  minDeciC?: number | undefined;
  maxDeciC?: number | undefined;
}): string | undefined {
  const { minDeciC, maxDeciC } = range;
  if (minDeciC !== undefined && maxDeciC !== undefined) {
    // The unit once, at the end: «0 bis 5 °C».
    return t.range.both(
      formatTemperature(minDeciC).replace(/\s°C$/, ''),
      formatTemperature(maxDeciC),
    );
  }
  if (minDeciC !== undefined) {
    return t.range.min(formatTemperature(minDeciC));
  }
  return maxDeciC === undefined ? undefined : t.range.max(formatTemperature(maxDeciC));
}

/** A quantity as a kitchen reads it; nothing in the house is said in words, not as «0 g». */
export function stockText(quantity: number, unit: Unit, none: string): string {
  return quantity > 0 ? formatQuantity(quantity, unit) : none;
}

/** The order of the kinds in a picker: the cold chain first, then the rest. */
export const KIND_ORDER: readonly AreaKind[] = ['cold', 'frozen', 'dry', 'bar', 'station', 'other'];

/**
 * The last result of a live query. While a query runs again with a new text it has no data for
 * a moment; keeping what was there stops the list from flickering under the fingers.
 */
export function useKept<TValue>(value: TValue | undefined): TValue | undefined {
  const [kept, setKept] = useState(value);
  if (value !== undefined && value !== kept) {
    setKept(value);
  }
  return value ?? kept;
}

const TEXT_INPUTS =
  'input:not([type="radio"]):not([type="checkbox"]):not([type="file"]):not([type="search"])';

/**
 * Tells the on-screen keyboard what Enter does in every text field below `ref` (ADR-0013): it
 * moves on, or it finishes the form. The fields of the UI kit do not take the attribute
 * themselves, so it is set on what they render.
 */
export function useEnterKeyHint(ref: RefObject<HTMLElement | null>, hint: 'next' | 'done'): void {
  useEffect(() => {
    for (const input of ref.current?.querySelectorAll(TEXT_INPUTS) ?? []) {
      if (input.getAttribute('enterkeyhint') !== hint) {
        input.setAttribute('enterkeyhint', hint);
      }
    }
  });
}
