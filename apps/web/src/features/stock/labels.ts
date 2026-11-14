import {
  formatSwissDate,
  movementTypeLabel,
  wasteReasonLabel,
  type DateKind,
  type LocalDate,
  type MovementView,
} from '@randen/core';
import { stockMessages } from './messages';

const t = stockMessages;

/** The date of a lot in words: «zu verbrauchen bis 15.11.2026», «ohne Datum». */
export function dateText(expiresOn: LocalDate | undefined, dateKind: DateKind): string {
  return expiresOn === undefined ? t.date.none : t.date[dateKind](formatSwissDate(expiresOn));
}

/**
 * What a movement was, as the journal says it: «Abschreiber · Verdorben», «Verbrauch · Küche»,
 * «Korrektur · Inventur». The second word says why, where the booking knows it.
 */
export function movementText(
  movement: Pick<
    MovementView,
    'type' | 'reason' | 'purpose' | 'countId' | 'lotOrigin' | 'quantity'
  >,
): string {
  const type = movementTypeLabel(movement.type);
  let detail: string | undefined;
  if (movement.reason !== undefined) {
    detail = wasteReasonLabel(movement.reason);
  } else if (movement.purpose !== undefined) {
    detail = t.movements.purposes[movement.purpose];
  } else if (movement.type === 'adjustment') {
    if (movement.countId !== undefined || movement.lotOrigin === 'count') {
      detail = t.movements.count;
    } else if (movement.lotOrigin === 'opening' && movement.quantity > 0) {
      detail = t.movements.opening;
    }
  }
  return detail === undefined ? type : t.movements.detail(type, detail);
}
