import {
  formatDecimal,
  formatPercent,
  rappen,
  type BudgetFigures,
  type Incomplete,
  type YearMonth,
} from '@randen/core';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { useMoney } from '../../app/hooks';
import { paths } from '../../app/paths';
import { ButtonLink } from '../../ui/Button';
import { Notice } from '../../ui/Notice';
import { ProgressBar, type ProgressTone } from '../../ui/charts';
import { numbersMessages as t } from './messages';
import { monthName } from './shared';

/** A share in basis points in words: 3000 → «30 %», 3250 → «32.5 %». */
export function percentText(bps: number): string {
  return formatPercent(bps, { digits: bps % 100 === 0 ? 0 : 1 });
}

/** A change against the period before, signed: «+12 % gegenüber der Vorperiode». */
export function changeLabel(current: number, previous: number): string {
  if (previous === 0) {
    return current === 0 ? t.tiles.same : t.tiles.noComparison;
  }
  const bps = Math.round(((current - previous) * 10_000) / previous);
  if (bps === 0) {
    return t.tiles.same;
  }
  return t.tiles.change(`${bps > 0 ? '+' : '-'}${formatPercent(Math.abs(bps), { digits: 0 })}`);
}

/** The points a share is above or below its target, with one decimal: «1.2». */
export function pointsText(bps: number): string {
  return formatDecimal(Math.abs(bps) / 100, { digits: 1 });
}

/**
 * The purchases of a month against its budget: a bar from zero to the budget, with a tick where
 * the month stands today (docs/regeln.md H5). Without a budget the caller says so.
 */
export function BudgetProgress({ figures }: { figures: BudgetFigures }) {
  const money = useMoney();
  const budget = figures.budgetRappen;
  if (budget === undefined || budget <= 0) {
    return <p className="text-ink-muted">{t.budget.none}</p>;
  }
  const spent = figures.spentRappen;
  const spentBps = Math.round((spent * 10_000) / budget);
  const tone: ProgressTone =
    figures.status === 'over' ? 'danger' : figures.status === 'tight' ? 'soon' : 'wine';
  return (
    <ProgressBar
      label={t.budget.label}
      value={spent}
      max={budget}
      valueText={t.budget.of(money.format(rappen(spent)), money.format(rappen(budget)))}
      summary={t.budget.summary(percentText(spentBps), percentText(figures.monthPassedBps))}
      tone={tone}
      marker={{
        value: Math.round((budget * figures.monthPassedBps) / 10_000),
        label: t.budget.marker(figures.day, figures.daysInMonth),
      }}
      hint={t.budget.status[figures.status ?? 'on_track']}
    />
  );
}

/** What is incomplete, in words, with the way to fix it: never a pretty figure on gaps (ADR-0008). */
export function IncompleteNotices({ incomplete }: { incomplete: Incomplete }) {
  const money = useMoney();
  const notes: ReactNode[] = [];
  if (incomplete.daysWithoutSales > 0) {
    notes.push(
      <Notice
        key="sales"
        tone="soon"
        variant="row"
        action={
          <ButtonLink to={paths.sales()} variant="secondary" size="sm">
            {t.notices.noSalesAction}
          </ButtonLink>
        }
      >
        {t.notices.noSales(incomplete.daysWithoutSales)}
      </Notice>,
    );
  }
  if (incomplete.consumptionWithoutSalesRappen > 0) {
    notes.push(
      <Notice key="consumption" tone="soon" variant="row">
        {t.notices.consumption(money.format(incomplete.consumptionWithoutSalesRappen))}
      </Notice>,
    );
  }
  if (incomplete.dishesWithoutCost > 0) {
    notes.push(
      <Notice
        key="dishes"
        tone="soon"
        variant="row"
        action={
          <Link
            to={paths.recipes()}
            className="inline-flex min-h-11 items-center rounded-lg font-semibold text-wine-800 hover:underline"
          >
            {t.notices.dishesAction}
          </Link>
        }
      >
        {t.notices.dishes(incomplete.dishesWithoutCost)}
      </Notice>,
    );
  }
  return notes.length === 0 ? null : <div className="space-y-3">{notes}</div>;
}

/** The month with «‹» and «›» on each side, both 44 px; the month is kept in the address. */
export function MonthSwitch({
  month,
  previousTo,
  nextTo,
  onMonth,
}: {
  month: YearMonth;
  previousTo: YearMonth;
  nextTo: YearMonth;
  onMonth: (month: YearMonth) => void;
}) {
  const button =
    'inline-flex size-11 items-center justify-center rounded-xl text-wine-800 hover:bg-wine-50';
  return (
    <div className="flex items-center justify-between gap-2">
      <button
        type="button"
        className={button}
        aria-label={t.budgetPage.previous}
        onClick={() => {
          onMonth(previousTo);
        }}
      >
        <ChevronLeft aria-hidden className="size-6" />
      </button>
      <p className="text-lg font-semibold" aria-live="polite">
        {monthName(month)}
      </p>
      <button
        type="button"
        className={button}
        aria-label={t.budgetPage.next}
        onClick={() => {
          onMonth(nextTo);
        }}
      >
        <ChevronRight aria-hidden className="size-6" />
      </button>
    </div>
  );
}
