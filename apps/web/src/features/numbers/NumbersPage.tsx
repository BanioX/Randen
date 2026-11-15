import { formatPercent, formatSwissDate, rappen, type Overview } from '@randen/core';
import {
  ChartColumn,
  FileText,
  ListOrdered,
  Percent,
  Receipt,
  Scale,
  Trash2,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { useSearchParams } from 'react-router';
import { errorText, useMoney, useQueryResult, useToday } from '../../app/hooks';
import { useModule } from '../../app/modules';
import { paths } from '../../app/paths';
import { useDetailed } from '../../app/view';
import { ButtonLink } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { EmptyState } from '../../ui/EmptyState';
import { GroupedList, ListRow } from '../../ui/GroupedList';
import { Notice } from '../../ui/Notice';
import { PageHeader } from '../../ui/PageHeader';
import { Section } from '../../ui/Section';
import { SegmentedControl } from '../../ui/SegmentedControl';
import { KpiGrid, StatTile } from '../../ui/StatTile';
import { BarChart } from '../../ui/charts';
import { BudgetProgress, IncompleteNotices, changeLabel, percentText, pointsText } from './parts';
import { numbersMessages as t } from './messages';
import { monthName, parsePeriod, periodRange, PERIODS, shortDay, type Period } from './shared';

/**
 * «Zahlen», the overview (docs/regeln.md H5): the answer first, the dark card with the cost of
 * goods against the target, the figures, the budget of the month, a chart and the doors on. The
 * period sits in the address. With «Erweitert» the figures show with changes and a chart; on
 * the essentials view the month shows in a few figures (ADR-0015).
 */
export function NumbersPage() {
  const today = useToday();
  const detailed = useDetailed();
  const [params, setParams] = useSearchParams();
  const period: Period = detailed ? parsePeriod(params.get('period')) : 'month';
  const range = periodRange(period, today);
  const result = useQueryResult('numbers.overview', range);

  return (
    <>
      <PageHeader title={t.title} subtitle={t.today(formatSwissDate(today))} />
      <div className="space-y-8">
        {detailed ? (
          <SegmentedControl
            label={t.period.label}
            value={period}
            options={PERIODS.map((value) => ({ value, label: periodLabel(value) }))}
            onChange={(value) => {
              setParams(
                (current) => {
                  const next = new URLSearchParams(current);
                  next.set('period', value);
                  return next;
                },
                { replace: true },
              );
            }}
          />
        ) : null}
        {result.status === 'error' ? (
          <Notice tone="danger">{`${t.errorTitle} ${errorText(result.error)}`}</Notice>
        ) : result.data === undefined ? null : (
          <Figures data={result.data} detailed={detailed} />
        )}
        <Doors detailed={detailed} />
      </div>
    </>
  );
}

function periodLabel(period: Period): string {
  return period === '7' ? t.period.week : period === '30' ? t.period.days : t.period.month;
}

function Figures({ data, detailed }: { data: Overview; detailed: boolean }) {
  const money = useMoney();
  const { current, previous } = data;
  const nothing =
    current.purchasesRappen === 0 &&
    current.costOfGoodsRappen === 0 &&
    current.wasteRappen === 0 &&
    current.netRevenueRappen === 0 &&
    data.stock.articleCount === 0;
  if (nothing) {
    return (
      <EmptyState
        icon={ChartColumn}
        title={t.empty.title}
        text={t.empty.text}
        action={
          <ButtonLink to={paths.receive()} variant="secondary">
            {t.empty.action}
          </ButtonLink>
        }
      />
    );
  }
  const budgetLeft = data.budget.remainingRappen;
  return (
    <>
      <FoodCostCard data={data} />
      {detailed ? (
        <KpiGrid>
          <StatTile
            label={t.tiles.net}
            unit={money.symbol}
            value={money.format(current.netRevenueRappen, { currency: false })}
            hint={changeLabel(current.netRevenueRappen, previous.netRevenueRappen)}
          />
          <StatTile
            label={t.tiles.purchases}
            unit={money.symbol}
            value={money.format(current.purchasesRappen, { currency: false })}
            hint={changeLabel(current.purchasesRappen, previous.purchasesRappen)}
            to={paths.receive()}
          />
          <StatTile
            label={t.tiles.waste}
            unit={money.symbol}
            value={money.format(current.wasteRappen, { currency: false })}
            hint={changeLabel(current.wasteRappen, previous.wasteRappen)}
            to={paths.wasteReport()}
          />
          <StatTile
            label={t.tiles.stock}
            unit={money.symbol}
            value={money.format(data.stock.valueRappen, { currency: false })}
            hint={t.tiles.articles(data.stock.articleCount)}
            to={paths.stock()}
          />
        </KpiGrid>
      ) : (
        <KpiGrid>
          <StatTile
            label={t.tiles.purchases}
            unit={money.symbol}
            value={money.format(current.purchasesRappen, { currency: false })}
            to={paths.receive()}
          />
          <StatTile
            label={t.tiles.waste}
            unit={money.symbol}
            value={money.format(current.wasteRappen, { currency: false })}
            to={paths.wasteReport()}
          />
          <StatTile
            label={t.tiles.budgetLeft}
            unit={budgetLeft === undefined ? undefined : money.symbol}
            value={
              budgetLeft === undefined
                ? t.tiles.noBudget
                : money.format(budgetLeft, { currency: false })
            }
            to={paths.budget()}
          />
        </KpiGrid>
      )}
      <Section title={t.budget.title(monthName(data.budget.month))} titleStyle="group">
        <Card>
          {data.budget.budgetRappen === undefined ? (
            <div className="space-y-2">
              <p className="text-ink-muted">{t.budget.none}</p>
              <ButtonLink to={paths.budget()} variant="secondary" size="sm">
                {t.budget.add}
              </ButtonLink>
            </div>
          ) : (
            <div className="space-y-3">
              <BudgetProgress figures={data.budget} />
              {data.budget.projectionRappen === undefined ? null : (
                <p className="text-sm text-ink-muted">
                  {t.budget.projection(money.format(data.budget.projectionRappen))}
                </p>
              )}
            </div>
          )}
        </Card>
      </Section>
      {detailed ? <Chart data={data} /> : null}
      <IncompleteNotices incomplete={data.incomplete} />
    </>
  );
}

/** The one dark card: the cost of goods in percent against the target, in one sentence. */
function FoodCostCard({ data }: { data: Overview }) {
  const share = data.current.foodCostBps;
  const target = data.targetFoodCostBps;
  let hint: string = t.foodCost.none;
  if (share !== undefined) {
    const diff = share - target;
    hint =
      diff > 0
        ? t.foodCost.above(pointsText(diff), percentText(target))
        : diff < 0
          ? t.foodCost.below(pointsText(diff), percentText(target))
          : t.foodCost.on(percentText(target));
  }
  return (
    <StatTile
      variant="premium"
      label={t.foodCost.label}
      value={share === undefined ? t.foodCost.open : formatPercent(share)}
      hint={hint}
    />
  );
}

/** Net revenue against cost of goods per day, in one chart (ADR-0015: only with «Erweitert»). */
function Chart({ data }: { data: Overview }) {
  const money = useMoney();
  const { current } = data;
  return (
    <Section title={t.chart.title} titleStyle="group">
      <BarChart
        summary={t.chart.summary(
          money.format(current.netRevenueRappen),
          money.format(current.costOfGoodsRappen),
        )}
        categoryLabel={t.chart.category}
        valueLabel={t.chart.value}
        secondLabel={t.chart.cost}
        mode="grouped"
        data={data.series.map((row) => ({
          label: shortDay(row.day),
          value: row.netRevenueRappen,
          second: row.costOfGoodsRappen,
        }))}
        valueLabels="none"
        formatValue={(value) => money.format(rappen(Math.round(value)))}
        height={200}
      />
    </Section>
  );
}

interface Door {
  to: string;
  title: string;
  detail: string;
  icon: LucideIcon;
}

/** The doors on: each function shows its own, a page that is off stays reachable by its address. */
function Doors({ detailed }: { detailed: boolean }) {
  const sales = useModule('sales');
  const doors: Door[] = [];
  if (sales) {
    doors.push(
      {
        to: paths.sales(),
        title: t.doors.sales.title,
        detail: t.doors.sales.detail,
        icon: Receipt,
      },
      {
        to: paths.margins(),
        title: t.doors.margins.title,
        detail: t.doors.margins.detail,
        icon: Percent,
      },
    );
    if (detailed) {
      doors.push({
        to: paths.menuEngineering(),
        title: t.doors.menuEngineering.title,
        detail: t.doors.menuEngineering.detail,
        icon: ListOrdered,
      });
    }
  }
  doors.push({
    to: paths.budget(),
    title: t.doors.budget.title,
    detail: t.doors.budget.detail,
    icon: Wallet,
  });
  if (detailed) {
    doors.push({
      to: paths.breakEven(),
      title: t.doors.breakEven.title,
      detail: t.doors.breakEven.detail,
      icon: Scale,
    });
  }
  doors.push(
    {
      to: paths.wasteReport(),
      title: t.doors.waste.title,
      detail: t.doors.waste.detail,
      icon: Trash2,
    },
    {
      to: paths.monthReport(),
      title: t.doors.report.title,
      detail: t.doors.report.detail,
      icon: FileText,
    },
  );
  return (
    <Section title={t.doors.title} titleStyle="group">
      <GroupedList>
        {doors.map((door) => (
          <ListRow
            key={door.to}
            title={door.title}
            subtitle={door.detail}
            icon={door.icon}
            to={door.to}
          />
        ))}
      </GroupedList>
    </Section>
  );
}
