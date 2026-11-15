import {
  addDays,
  daysBetween,
  formatQuantity,
  formatSwissDate,
  type LocalDate,
  type OrderDay,
  type OrderStatus,
  type Packs,
  type ShoppingReason,
  type PurchaseReason,
  type Unit,
  type Weekday,
} from '@randen/core';
import { Minus, Plus } from 'lucide-react';
import { StatusChip } from '../../ui/StatusChip';
import type { Tone } from '../../ui/tones';
import { purchasingMessages } from './messages';

const t = purchasingMessages;

const SUNDAY_FIRST: readonly Weekday[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

/** «16.11.» */
export function shortDate(date: LocalDate): string {
  return formatSwissDate(date).slice(0, 6);
}

function weekdayOf(date: LocalDate): Weekday {
  const [year = 0, month = 1, day = 1] = date.split('-').map(Number);
  return SUNDAY_FIRST[new Date(Date.UTC(year, month - 1, day)).getUTCDay()] ?? 'mon';
}

/** A day as a kitchen says it: «heute», «morgen», «Mo, 16.11.». */
export function dayLabel(date: LocalDate, today: LocalDate): string {
  const inDays = daysBetween(today, date);
  if (inDays === 0) {
    return t.today;
  }
  if (inDays === 1) {
    return t.tomorrow;
  }
  return `${t.weekdays[weekdayOf(date)]}, ${shortDate(date)}`;
}

/** The day of a supplier, from today. */
export function supplierDayLabel(day: OrderDay, today: LocalDate): string {
  return dayLabel(addDays(today, day.inDays), today);
}

/** «2 Sack à 10 kg», or the plain quantity. */
export function quantityLabel(quantity: number, unit: Unit, packs?: Packs): string {
  return packs === undefined
    ? formatQuantity(quantity, unit)
    : t.packs(packs.count, packs.label, formatQuantity(packs.size, unit));
}

const STATUS_TONES: Record<OrderStatus, Tone> = {
  draft: 'neutral',
  sent: 'soon',
  received: 'ok',
  cancelled: 'neutral',
};

export function OrderStatusChip({ status, size }: { status: OrderStatus; size?: 'sm' | 'md' }) {
  return (
    <StatusChip tone={STATUS_TONES[status]} size={size} outline={status === 'draft'}>
      {t.status[status]}
    </StatusChip>
  );
}

const REASON_TONES: Record<ShoppingReason | PurchaseReason, Tone> = {
  below_min: 'soon',
  plan: 'neutral',
  both: 'soon',
  missing: 'soon',
  manual: 'neutral',
};

/** Why a line is proposed: «Unter Mindestbestand», «Für den Menüplan», «Fehlt». */
export function ReasonChips({
  reasons,
}: {
  reasons: readonly (ShoppingReason | PurchaseReason)[];
}) {
  const shown = reasons.flatMap((reason): (ShoppingReason | PurchaseReason)[] =>
    reason === 'both' ? ['below_min', 'plan'] : [reason],
  );
  return (
    <>
      {shown.map((reason) => (
        <StatusChip key={reason} tone={REASON_TONES[reason]} size="sm" outline={reason === 'plan'}>
          {t.reasons[reason]}
        </StatusChip>
      ))}
    </>
  );
}

const STEP =
  'flex size-11 shrink-0 items-center justify-center rounded-xl bg-surface-muted text-wine-800 hover:bg-line disabled:opacity-40 touch-manipulation';

/**
 * Whole packs, one tap at a time: «− 2 Sack à 10 kg +». The figure in the middle is announced
 * politely, so a screen reader hears the new count after every tap.
 */
export function PackStepper({
  name,
  count,
  label,
  size,
  unit,
  onChange,
}: {
  name: string;
  count: number;
  label?: string | undefined;
  size: number;
  unit: Unit;
  onChange: (count: number) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        className={STEP}
        aria-label={t.proposal.lessOf(name)}
        disabled={count <= 0}
        onClick={() => {
          onChange(Math.max(0, count - 1));
        }}
      >
        <Minus size={20} strokeWidth={1.75} aria-hidden="true" />
      </button>
      <span
        aria-live="polite"
        className="min-w-24 text-center text-[0.9375rem] font-semibold tabular-nums"
      >
        {count === 0 ? t.proposal.leftOut : t.packs(count, label, formatQuantity(size, unit))}
      </span>
      <button
        type="button"
        className={STEP}
        aria-label={t.proposal.moreOf(name)}
        onClick={() => {
          onChange(count + 1);
        }}
      >
        <Plus size={20} strokeWidth={1.75} aria-hidden="true" />
      </button>
    </div>
  );
}
