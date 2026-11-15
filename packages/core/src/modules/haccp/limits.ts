import type { DeciCelsius } from '../../model/primitives';
import type { TemperatureKind } from '../../model/haccp';

/**
 * The limits Randen proposes for food temperatures («Richtwert», ADR-0012, docs/fakten.md 4.3).
 * They are guidelines, not law: the Leitlinie GVG and the cantonal Merkblätter (belegt, Leitlinie).
 * The business may overrule them with its own self-control concept. Every log stores the limits
 * that applied when it was made, so a later change never rewrites history.
 *
 * Storage (`storage`) has no entry here: its limits are the range of the area (areas module).
 */
export interface TemperatureProposal {
  minDeciC?: DeciCelsius;
  maxDeciC?: DeciCelsius;
  /** Where the number comes from, in the words of docs/fakten.md section 4.3. */
  source: string;
}

type FoodKind = Exclude<TemperatureKind, 'storage'>;

export const TEMPERATURE_PROPOSALS: Readonly<Record<FoodKind, TemperatureProposal>> = {
  // Goods at the door: leicht verderbliche Lebensmittel höchstens 5 °C (GVG Anhang 6.2, belegt).
  // Frozen goods and minced meat have their own limits (HyV Art. 25 Abs. 3, GVG Kap. 2.4.5); the
  // check at the door of the stock module records what the person measured, the limit here is
  // the chilled one.
  receiving: {
    maxDeciC: 50,
    source: 'GVG Anhang 6.2: leicht verderbliche Lebensmittel höchstens 5 °C',
  },
  // Garen und Regenerieren: Kerntemperatur mindestens 70 °C während mindestens 2 Minuten
  // (GVG Kap. 2.4.4; BS-Temp und AG-15 nennen ebenfalls 70 °C).
  cooking: { minDeciC: 700, source: 'GVG Kap. 2.4.4: Kerntemperatur mindestens 70 °C' },
  // Warmhalten: mindestens 65 °C Kerntemperatur, höchstens 3 Stunden (GVG Kap. 2.4.4 und 2.4.7).
  // The 3 hours are not checked here: the person notes them in the action if needed.
  hot_holding: {
    minDeciC: 650,
    source: 'GVG Kap. 2.4.4 und 2.4.7: mindestens 65 °C, höchstens 3 Stunden',
  },
  // Abkühlen: innert 90 Minuten von 65 °C auf weniger als 5 °C (GVG Kap. 2.4.4). A single reading
  // at the end of the cooling counts. Readings are whole tenths of a degree (DeciCelsius), so
  // «weniger als 5 °C» is exactly «höchstens 4,9 °C»: 49 is the highest reading that passes, and
  // 50 (5.0 °C) does not. The cantonal 50-to-10 °C rule (BS-Temp, AG-15) is a time rule and is not
  // checked by a single reading.
  cooling: { maxDeciC: 49, source: 'GVG Kap. 2.4.4: auf weniger als 5 °C innert 90 Minuten' },
};

/** The food kinds in the order of the record form. */
export const FOOD_KINDS: readonly FoodKind[] = ['cooking', 'hot_holding', 'cooling', 'receiving'];

/** True when the reading lies within the limits; a missing limit is no limit. */
export function withinLimits(
  deciC: number,
  limits: { minDeciC?: number | undefined; maxDeciC?: number | undefined },
): boolean {
  return (
    (limits.minDeciC === undefined || deciC >= limits.minDeciC) &&
    (limits.maxDeciC === undefined || deciC <= limits.maxDeciC)
  );
}
