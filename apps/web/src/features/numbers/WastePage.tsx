import { formatPercent, formatQuantity, rappen, type WasteReport } from '@randen/core';
import { Link, useSearchParams } from 'react-router';
import { errorText, useMoney, useQueryResult, useToday } from '../../app/hooks';
import { paths } from '../../app/paths';
import { useDetailed } from '../../app/view';
import { Card } from '../../ui/Card';
import { DataTable, type DataTableColumn } from '../../ui/DataTable';
import { Notice } from '../../ui/Notice';
import { PageHeader } from '../../ui/PageHeader';
import { Section } from '../../ui/Section';
import { SegmentedControl } from '../../ui/SegmentedControl';
import { StatTile } from '../../ui/StatTile';
import { BarChart, HBarChart } from '../../ui/charts';
import { changeLabel } from './parts';
import { numbersMessages as t } from './messages';
import { parsePeriod, periodRange, PERIODS, type Period } from './shared';

/**
 * «Abschreiber» of a period (docs/regeln.md H5): the answer first, the sum in francs and in
 * kilograms with the change against the period before, then the breakdowns. The charts are
 * evaluations and show with «Erweitert»; the essentials keep the table by kind.
 */
export function WastePage() {
  const today = useToday();
  const detailed = useDetailed();
  const [params, setParams] = useSearchParams();
  const period: Period = parsePeriod(params.get('period'));
  const result = useQueryResult('numbers.waste', periodRange(period, today));
  const money = useMoney();

  return (
    <>
      <PageHeader title={t.wastePage.title} back={{ to: paths.numbers(), label: t.back }} />
      <div className="space-y-8">
        <SegmentedControl
          label={t.period.label}
          value={period}
          options={PERIODS.map((value) => ({
            value,
            label: value === '7' ? t.period.week : value === '30' ? t.period.days : t.period.month,
          }))}
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
        {result.status === 'error' ? (
          <Notice tone="danger">{`${t.errorTitle} ${errorText(result.error)}`}</Notice>
        ) : result.data === undefined ? null : (
          <WasteView report={result.data} detailed={detailed} money={money} />
        )}
      </div>
    </>
  );
}

type Money = ReturnType<typeof useMoney>;

function WasteView({
  report,
  detailed,
  money,
}: {
  report: WasteReport;
  detailed: boolean;
  money: Money;
}) {
  const share =
    report.shareOfPurchasesBps === undefined
      ? undefined
      : formatPercent(report.shareOfPurchasesBps, { digits: 2 });
  const weight = weightText(report.byKind);
  const total = money.format(report.totalRappen);
  return (
    <div className="space-y-8">
      <p className="text-2xl leading-snug font-semibold text-ink">
        {t.wastePage.lead(total, share)}
      </p>
      <StatTile
        variant="premium"
        label={t.wastePage.total}
        unit={money.symbol}
        value={money.format(report.totalRappen, { currency: false })}
        hint={[
          report.changeBps === undefined && report.previousRappen === 0
            ? t.wastePage.noChange
            : changeLabel(report.totalRappen, report.previousRappen),
          weight === '' ? undefined : `${t.wastePage.weight}: ${weight}`,
        ]
          .filter((part): part is string => part !== undefined)
          .join(' · ')}
      />
      <Section title={t.wastePage.byKind.title} titleStyle="group">
        <Card padding="compact">
          <DataTable
            caption={t.wastePage.category}
            hideCaption
            columns={kindColumns(money)}
            rows={report.byKind}
            getRowKey={(row) => row.kind}
          />
        </Card>
      </Section>
      {detailed ? <Charts report={report} money={money} /> : null}
      <Section title={t.wastePage.top.title} titleStyle="group">
        <DataTable
          caption={t.wastePage.top.caption}
          hideCaption
          columns={[
            { key: 'article', header: t.wastePage.top.article, render: (row) => row.name },
            {
              key: 'quantity',
              header: t.wastePage.top.quantity,
              align: 'right',
              hideBelow: 'md',
              render: (row) => formatQuantity(row.quantity, row.unit),
            },
            {
              key: 'amount',
              header: t.wastePage.top.amount,
              align: 'right',
              render: (row) => money.format(row.valueRappen),
            },
          ]}
          rows={report.topArticles}
          getRowKey={(row) => row.articleId}
          empty={<p className="p-4 text-ink-muted">{t.wastePage.top.empty}</p>}
        />
      </Section>
      <p>
        <Link
          to={paths.journal()}
          className="inline-flex min-h-11 items-center rounded-lg font-semibold text-wine-800 hover:underline"
        >
          {t.wastePage.journal}
        </Link>
      </p>
    </div>
  );
}

/** Kinds as a table: the same words as the charts, the amounts right-aligned. */
function kindColumns(money: Money): DataTableColumn<WasteReport['byKind'][number]>[] {
  return [
    { key: 'kind', header: t.wastePage.category, render: (row) => row.label },
    {
      key: 'weight',
      header: t.wastePage.weight,
      align: 'right',
      hideBelow: 'md',
      render: (row) => weightOf(row),
    },
    {
      key: 'amount',
      header: t.wastePage.value,
      align: 'right',
      render: (row) => money.format(row.valueRappen),
    },
  ];
}

interface Amount {
  grams: number;
  millilitres: number;
  pieces: number;
}

/** Grams in kilograms, millilitres and pieces named as they are: never converted by guess. */
function weightOf(row: Amount): string {
  const parts: string[] = [];
  if (row.grams > 0) {
    parts.push(formatQuantity(row.grams, 'g'));
  }
  if (row.millilitres > 0) {
    parts.push(formatQuantity(row.millilitres, 'ml'));
  }
  if (row.pieces > 0) {
    parts.push(formatQuantity(row.pieces, 'pcs'));
  }
  return parts.length === 0 ? '–' : parts.join(' · ');
}

function weightText(rows: readonly Amount[]): string {
  const sum = (key: keyof Amount) => rows.reduce((total, row) => total + row[key], 0);
  const text = weightOf({
    grams: sum('grams'),
    millilitres: sum('millilitres'),
    pieces: sum('pieces'),
  });
  return text === '–' ? '' : text;
}

function Charts({ report, money }: { report: WasteReport; money: Money }) {
  const largestKind = [...report.byKind].sort((a, b) => b.valueRappen - a.valueRappen)[0];
  const largestReason = [...report.byReason].sort((a, b) => b.valueRappen - a.valueRappen)[0];
  const weekday = [...report.byWeekday].sort((a, b) => b.valueRappen - a.valueRappen)[0];
  const weekdayIndex = Math.max(
    0,
    report.byWeekday.findIndex((row) => row === weekday),
  );
  const amount = (value: number) => money.format(rappen(Math.round(value)));
  return (
    <>
      <Section title={t.wastePage.byKind.title} titleStyle="group">
        <Card>
          <HBarChart
            summary={
              largestKind === undefined || largestKind.valueRappen === 0
                ? t.wastePage.none
                : t.wastePage.byKind.summary(
                    largestKind.label,
                    money.format(largestKind.valueRappen),
                  )
            }
            categoryLabel={t.wastePage.category}
            valueLabel={t.wastePage.value}
            data={report.byKind.map((row) => ({ label: row.label, value: row.valueRappen }))}
            formatValue={amount}
          />
        </Card>
      </Section>
      <Section title={t.wastePage.byReason.title} titleStyle="group">
        <Card>
          <HBarChart
            summary={
              largestReason === undefined || largestReason.valueRappen === 0
                ? t.wastePage.none
                : t.wastePage.byReason.summary(
                    largestReason.label,
                    money.format(largestReason.valueRappen),
                  )
            }
            categoryLabel={t.wastePage.byReason.title}
            valueLabel={t.wastePage.value}
            data={report.byReason.map((row) => ({ label: row.label, value: row.valueRappen }))}
            formatValue={amount}
          />
        </Card>
      </Section>
      <Section title={t.wastePage.byWeekday.title} titleStyle="group">
        <Card>
          <BarChart
            summary={
              weekday === undefined || weekday.valueRappen === 0
                ? t.wastePage.none
                : t.wastePage.byWeekday.summary(
                    t.wastePage.weekdays[weekdayIndex] ?? '',
                    money.format(weekday.valueRappen),
                  )
            }
            categoryLabel={t.wastePage.byWeekday.title}
            valueLabel={t.wastePage.value}
            data={report.byWeekday.map((row, index) => ({
              label: t.wastePage.weekdays[index] ?? '',
              value: row.valueRappen,
            }))}
            valueLabels="none"
            formatValue={amount}
          />
        </Card>
      </Section>
    </>
  );
}
