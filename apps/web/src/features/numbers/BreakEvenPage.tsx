import { rappen, type BreakEvenFigures, type OperationOutput, type YearMonth } from '@randen/core';
import { Scale } from 'lucide-react';
import { useState } from 'react';
import { errorText, useCommand, useMoney, useQueryResult, useToday } from '../../app/hooks';
import type { Money } from '../../app/money-format';
import { paths } from '../../app/paths';
import { Card } from '../../ui/Card';
import { EmptyState } from '../../ui/EmptyState';
import { FormActions } from '../../ui/FormActions';
import { MoneyField } from '../../ui/MoneyField';
import { Notice } from '../../ui/Notice';
import { PageHeader } from '../../ui/PageHeader';
import { Section } from '../../ui/Section';
import { KpiGrid, StatTile } from '../../ui/StatTile';
import { ProgressBar, type ProgressTone } from '../../ui/charts';
import { useToast } from '../../ui/Toast';
import { numbersMessages as t } from './messages';
import { percentText } from './parts';
import { dayAndMonth, monthOf } from './shared';

type BudgetRow = OperationOutput<'budgets.get'>['budget'];

/** Francs without the empty Rappen: «CHF 50’000», but «CHF 10’000.50». */
function francs(money: Money, amount: number): string {
  return money.format(rappen(amount)).replace(/\.00$/, '');
}

/**
 * «Break-even» of the month (docs/regeln.md H5): the answer first, the way to it as a bar from
 * zero, the figures underneath, the calculation in plain words, and the fixed costs right here.
 * Without fixed costs the page asks for them instead of showing a figure.
 */
export function BreakEvenPage() {
  const today = useToday();
  const month = monthOf(today);
  const view = useQueryResult('numbers.breakEven', { month });
  const budget = useQueryResult('budgets.get', { month });

  return (
    <>
      <PageHeader title={t.breakEvenPage.title} back={{ to: paths.numbers(), label: t.back }} />
      <div className="space-y-8">
        {view.status === 'error' ? (
          <Notice tone="danger">{`${t.errorTitle} ${errorText(view.error)}`}</Notice>
        ) : view.data === undefined ? null : view.data.fixedCostsRappen === undefined ? (
          <EmptyState
            icon={Scale}
            title={t.breakEvenPage.empty.title}
            text={t.breakEvenPage.empty.text}
          />
        ) : (
          <Answer view={view.data} />
        )}
        {budget.status === 'error' || budget.data === undefined ? null : (
          <FixedCostsForm
            key={`${month}:${budget.data.budget?.updatedAt ?? 'new'}`}
            month={month}
            row={budget.data.budget}
            proposal={budget.data.proposal}
          />
        )}
      </div>
    </>
  );
}

/** The answer in one sentence, the bar to it, the figures and the calculation in words. */
function Answer({ view }: { view: BreakEvenFigures }) {
  const money = useMoney();
  const breakEven = view.breakEvenRappen;
  const net = view.netRevenueRappen;
  let answer: string = view.reasons.includes('no_contribution')
    ? t.breakEvenPage.answerNoContribution
    : view.reasons.includes('no_revenue')
      ? t.breakEvenPage.answerNoRevenue
      : t.breakEvenPage.answerNone;
  if (breakEven !== undefined) {
    if (view.reached) {
      answer =
        view.reachedOn === undefined
          ? t.breakEvenPage.answerDone(francs(money, breakEven))
          : t.breakEvenPage.answerReached(dayAndMonth(view.reachedOn));
    } else {
      answer = t.breakEvenPage.answerOpen(
        francs(money, view.neededRappen ?? 0),
        francs(money, breakEven),
      );
    }
  }
  const unknown = t.breakEvenPage.figures.unknown;
  const tone: ProgressTone = view.reached ? 'ok' : 'wine';
  const reasons = view.reasons.map((reason) => t.breakEvenPage.reasons[reason]).join(' · ');
  return (
    <div className="space-y-8">
      <p className="text-2xl leading-snug font-semibold text-ink">{answer}</p>
      {breakEven === undefined || breakEven <= 0 ? null : (
        <ProgressBar
          label={t.breakEvenPage.bar.label}
          value={net}
          max={breakEven}
          valueText={t.breakEvenPage.bar.of(francs(money, net), francs(money, breakEven))}
          summary={t.breakEvenPage.bar.summary}
          tone={tone}
        />
      )}
      <KpiGrid>
        <StatTile
          label={t.breakEvenPage.figures.fixed}
          unit={view.fixedCostsRappen === undefined ? undefined : money.symbol}
          value={
            view.fixedCostsRappen === undefined
              ? unknown
              : money.format(view.fixedCostsRappen, { currency: false })
          }
          hint={t.breakEvenPage.figures.fixedHint}
        />
        <StatTile
          label={t.breakEvenPage.figures.contribution}
          value={view.contributionBps === undefined ? unknown : percentText(view.contributionBps)}
          hint={
            view.contributionBps === undefined
              ? t.breakEvenPage.figures.unknown
              : t.breakEvenPage.figures.contributionHint(percentText(view.contributionBps))
          }
        />
        <StatTile
          label={t.breakEvenPage.figures.revenue}
          unit={money.symbol}
          value={money.format(net, { currency: false })}
          hint={t.breakEvenPage.figures.revenueHint}
        />
        <StatTile
          label={t.breakEvenPage.figures.needed}
          unit={view.neededPerDayRappen === undefined ? undefined : money.symbol}
          value={
            view.neededPerDayRappen === undefined
              ? unknown
              : view.neededPerDayRappen === 0
                ? t.breakEvenPage.figures.neededDone
                : money.format(view.neededPerDayRappen, { currency: false })
          }
          hint={t.breakEvenPage.figures.neededHint(view.remainingDays)}
        />
      </KpiGrid>
      <StatTile
        label={t.breakEvenPage.figures.portions}
        value={
          view.breakEvenPortions === undefined
            ? unknown
            : t.breakEvenPage.figures.portionsCount(view.breakEvenPortions)
        }
        hint={
          view.averageMarginRappen === undefined
            ? reasons
            : t.breakEvenPage.figures.portionsHint(money.format(view.averageMarginRappen))
        }
      />
      {breakEven === undefined || view.fixedCostsRappen === undefined ? null : (
        <Card>
          <h2 className="text-lg font-semibold">{t.breakEvenPage.explain.title}</h2>
          <p className="mt-2 text-ink-muted">
            {t.breakEvenPage.explain.text(
              percentText(view.contributionBps ?? 0),
              francs(money, view.fixedCostsRappen),
              francs(money, breakEven),
            )}
          </p>
        </Card>
      )}
    </div>
  );
}

/**
 * The fixed costs of the month, saved in its budget. The budget command replaces the row, so the
 * other fields of the budget are passed on: what the budget page sets stays.
 */
function FixedCostsForm({
  month,
  row,
  proposal,
}: {
  month: YearMonth;
  row: BudgetRow;
  proposal: OperationOutput<'budgets.get'>['proposal'];
}) {
  const run = useCommand();
  const toast = useToast();
  const source = row ?? proposal;
  const [fixed, setFixed] = useState<number | null>(row?.fixedCostsRappen ?? null);
  const [purchases, setPurchases] = useState<number | null>(source?.purchaseBudgetRappen ?? null);
  const [error, setError] = useState<string | null>(null);

  async function save(event: { preventDefault: () => void }) {
    event.preventDefault();
    if (fixed === null || purchases === null) {
      return;
    }
    try {
      // Only what the saved budget of this month holds is passed on. The proposal of the month
      // before has targets this form does not show, so they are not saved with it.
      await run('budgets.set', {
        month,
        purchaseBudgetRappen: purchases,
        fixedCostsRappen: fixed,
        ...(row?.revenueTargetRappen === undefined
          ? {}
          : { revenueTargetRappen: row.revenueTargetRappen }),
        ...(row?.targetFoodCostBps === undefined
          ? {}
          : { targetFoodCostBps: row.targetFoodCostBps }),
        ...(row?.note === undefined ? {} : { note: row.note }),
      });
      setError(null);
      toast({ text: t.breakEvenPage.form.saved, tone: 'ok' });
    } catch (failure) {
      setError(errorText(failure));
    }
  }

  return (
    <form
      onSubmit={(event) => {
        void save(event);
      }}
      className="max-w-2xl"
    >
      <Section title={t.breakEvenPage.form.legend} titleStyle="group">
        <div className="grid gap-4 md:grid-cols-2">
          <MoneyField
            label={t.breakEvenPage.form.fixed}
            hint={t.breakEvenPage.form.fixedHint}
            value={fixed === null ? null : rappen(fixed)}
            onChange={(value) => {
              setFixed(value);
            }}
            required
          />
          {row === undefined ? (
            <MoneyField
              label={t.breakEvenPage.form.budget}
              hint={t.breakEvenPage.form.budgetHint}
              value={purchases === null ? null : rappen(purchases)}
              onChange={(value) => {
                setPurchases(value);
              }}
              required
            />
          ) : null}
        </div>
        <div className="mt-4">
          <FormActions primaryLabel={t.breakEvenPage.form.save} error={error} placement="inline" />
        </div>
      </Section>
    </form>
  );
}
