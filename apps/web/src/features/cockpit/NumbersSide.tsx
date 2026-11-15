import { formatPercent, rappen, wasteKindLabel, type CockpitToday } from '@randen/core';
import { Link } from 'react-router';
import { useMoney } from '../../app/hooks';
import { paths } from '../../app/paths';
import { Card } from '../../ui/Card';
import { HBarChart, ProgressBar, type ProgressTone } from '../../ui/charts';
import { Section } from '../../ui/Section';
import { cockpitMessages } from './messages';
import { monthName } from './shared';

const LINK =
  'inline-flex min-h-11 items-center rounded-lg font-semibold text-wine-800 hover:underline';

/** Half a month ahead of the calendar counts as «schnell»: amber before it turns red. */
const AHEAD_BPS = 1000;

/**
 * The purchase budget of the month: what came in against the budget, with a tick where the
 * month stands today. Without a budget, one line and the way to set one.
 */
export function BudgetCard({ figures }: { figures: CockpitToday['figures'] }) {
  const money = useMoney();
  const t = cockpitMessages.budget;
  const month = monthName(figures.foodCost.month);
  const budget = figures.budget;
  if (budget === undefined) {
    return (
      <Section title={t.title(month)} titleStyle="group">
        <Card>
          <p className="text-ink-muted">{t.none(month)}</p>
          <Link to={paths.budget()} className={`${LINK} mt-1`}>
            {t.add}
          </Link>
        </Card>
      </Section>
    );
  }
  const whole = budget.purchaseBudgetRappen;
  const spentBps = whole > 0 ? Math.round((budget.spentRappen * 10_000) / whole) : 0;
  const monthBps = Math.round((budget.day * 10_000) / budget.daysInMonth);
  const over = budget.spentRappen > whole;
  const tone: ProgressTone = over ? 'danger' : spentBps > monthBps + AHEAD_BPS ? 'soon' : 'wine';
  return (
    <Section title={t.title(month)} titleStyle="group">
      <Card>
        <ProgressBar
          label={t.label}
          value={budget.spentRappen}
          max={whole}
          valueText={t.of(money.format(budget.spentRappen), money.format(rappen(whole)))}
          summary={t.summary(
            formatPercent(spentBps, { digits: 0 }),
            formatPercent(monthBps, { digits: 0 }),
          )}
          tone={tone}
          marker={{
            value: Math.round((whole * budget.day) / budget.daysInMonth),
            label: t.day(budget.day, budget.daysInMonth),
          }}
          hint={
            over
              ? t.over(money.format(rappen(budget.spentRappen - whole)))
              : t.spent(formatPercent(spentBps, { digits: 0 }))
          }
        />
      </Card>
    </Section>
  );
}

/** Write-offs of the last 30 days by where the loss happened. Nothing written off: one line. */
export function WasteCard({ waste }: { waste: CockpitToday['wasteByKind'] }) {
  const money = useMoney();
  const t = cockpitMessages.waste;
  const [largest] = waste.kinds;
  return (
    <Section title={t.title} titleStyle="group">
      <Card>
        {largest === undefined ? (
          <p className="text-ink-muted">{t.none}</p>
        ) : (
          <HBarChart
            summary={t.summary(
              money.format(waste.totalRappen),
              wasteKindLabel(largest.kind),
              money.format(largest.valueRappen),
            )}
            categoryLabel={t.category}
            valueLabel={t.value}
            data={waste.kinds.map((row) => ({
              label: wasteKindLabel(row.kind),
              value: row.valueRappen,
            }))}
            formatValue={(value) => money.format(rappen(Math.round(value)))}
          />
        )}
      </Card>
    </Section>
  );
}
