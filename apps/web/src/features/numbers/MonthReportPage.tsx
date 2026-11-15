import {
  formatPercent,
  formatQuantity,
  formatSwissDate,
  rappen,
  type LocalDate,
  type MonthReport,
  type YearMonth,
} from '@randen/core';
import { Printer } from 'lucide-react';
import { useSearchParams } from 'react-router';
import { errorText, useMoney, useQueryResult, useToday } from '../../app/hooks';
import { paths } from '../../app/paths';
import { Button } from '../../ui/Button';
import { DataTable, type DataTableColumn } from '../../ui/DataTable';
import { Notice } from '../../ui/Notice';
import { PageHeader } from '../../ui/PageHeader';
import { Section } from '../../ui/Section';
import { MonthSwitch, percentText } from './parts';
import { numbersMessages as t } from './messages';
import { monthName, monthOf, parseMonth, shiftMonth } from './shared';

type Money = ReturnType<typeof useMoney>;

/**
 * The month report (docs/regeln.md H5, print): business and month, the cost of goods against the
 * revenue, the purchases against the budget, the write-offs in francs and kilograms, the count,
 * the stock, the break-even, the best and the weakest dishes, on white paper with hairlines. The
 * page on the screen has the month and the print button; the print has no navigation (AppShell).
 */
export function MonthReportPage() {
  const today = useToday();
  const [params, setParams] = useSearchParams();
  const month = parseMonth(params.get('month'), monthOf(today));
  const result = useQueryResult('numbers.monthReport', { month });
  const money = useMoney();

  const go = (next: YearMonth) => {
    setParams(
      (current) => {
        const following = new URLSearchParams(current);
        following.set('month', next);
        return following;
      },
      { replace: true },
    );
  };

  return (
    <>
      <div className="print:hidden">
        <PageHeader
          title={t.report.title}
          back={{ to: paths.numbers(), label: t.report.back }}
          actions={
            <Button
              variant="secondary"
              icon={Printer}
              onClick={() => {
                window.print();
              }}
            >
              {t.report.print}
            </Button>
          }
        />
        <div className="mt-6">
          <MonthSwitch
            month={month}
            previousTo={shiftMonth(month, -1)}
            nextTo={shiftMonth(month, 1)}
            onMonth={go}
          />
        </div>
      </div>
      {result.status === 'error' ? (
        <Notice tone="danger">{`${t.errorTitle} ${errorText(result.error)}`}</Notice>
      ) : result.data === undefined ? null : (
        <Report report={result.data} money={money} printedOn={today} />
      )}
    </>
  );
}

/** `printedOn` is the day of printing (today), not the last day of the month the report covers. */
function Report({
  report,
  money,
  printedOn,
}: {
  report: MonthReport;
  money: Money;
  printedOn: LocalDate;
}) {
  const { totals, budget, breakEven, waste, dishes, incomplete, meals } = report;
  const foodCostText = totals.foodCostBps === undefined ? '–' : formatPercent(totals.foodCostBps);
  const spent = budget.spentRappen;
  const left = budget.remainingRappen;
  return (
    <article className="mt-6 space-y-8 print:mt-0 print:space-y-6 print:text-black">
      <header className="hidden space-y-1 border-b border-line pb-3 print:block print:border-black">
        <p className="text-sm text-ink-muted print:text-black">{report.businessName}</p>
        <h2 className="text-2xl font-semibold print:text-black">
          {t.report.heading(monthName(report.month))}
        </h2>
        <p className="text-sm text-ink-muted print:text-black">
          {t.report.printedOn(formatSwissDate(printedOn))}
        </p>
      </header>

      <Section
        title={t.report.sections.costs}
        titleStyle="group"
        className="print:break-inside-avoid"
      >
        <Pairs
          rows={[
            [t.report.rows.net, money.format(totals.netRevenueRappen)],
            [t.report.rows.gross, money.format(totals.grossRevenueRappen)],
            [t.report.rows.goods, money.format(totals.costOfGoodsRappen)],
            [t.report.rows.foodCost, foodCostText],
            [t.report.rows.target, percentText(report.targetFoodCostBps)],
          ]}
        />
      </Section>

      <Section
        title={t.report.sections.budget}
        titleStyle="group"
        className="print:break-inside-avoid"
      >
        <Pairs
          rows={[
            [
              t.report.rows.budget,
              budget.budgetRappen === undefined ? '–' : money.format(rappen(budget.budgetRappen)),
            ],
            [t.report.rows.purchases, money.format(spent)],
            left === undefined
              ? [t.report.rows.left, '–']
              : left < 0
                ? [t.report.rows.over, money.format(rappen(Math.abs(left)))]
                : [t.report.rows.left, money.format(left)],
          ]}
        />
      </Section>

      <Section
        title={t.report.sections.waste}
        titleStyle="group"
        className="print:break-inside-avoid"
      >
        <Table
          caption={t.report.sections.waste}
          hideCaption
          rows={waste.byKind.map((row) => ({
            key: row.kind,
            kind: row.label,
            weight:
              [
                row.grams > 0 ? formatQuantity(row.grams, 'g') : '',
                row.millilitres > 0 ? formatQuantity(row.millilitres, 'ml') : '',
                row.pieces > 0 ? formatQuantity(row.pieces, 'pcs') : '',
              ]
                .filter((part) => part !== '')
                .join(' · ') || '–',
            amount: money.format(row.valueRappen),
          }))}
          columns={[
            { key: 'kind', header: t.report.rows.kind, render: (row) => row.kind },
            {
              key: 'weight',
              header: t.report.rows.weight,
              align: 'right',
              render: (row) => row.weight,
            },
            {
              key: 'amount',
              header: t.report.rows.amount,
              align: 'right',
              render: (row) => row.amount,
            },
          ]}
        />
        <p className="mt-2 text-sm text-ink-muted print:text-black">
          {`${t.report.rows.total}: ${money.format(waste.totalRappen)}${
            waste.shareOfPurchasesBps === undefined
              ? ''
              : ` · ${formatPercent(waste.shareOfPurchasesBps, { digits: 2 })} der Einkäufe`
          }`}
        </p>
      </Section>

      <Section
        title={t.report.sections.count}
        titleStyle="group"
        className="print:break-inside-avoid"
      >
        <Pairs
          rows={[
            totals.countLossRappen > 0
              ? [t.report.rows.lost, money.format(totals.countLossRappen)]
              : [t.report.rows.lost, t.report.rows.none],
            totals.countGainRappen > 0
              ? [t.report.rows.gained, money.format(totals.countGainRappen)]
              : [t.report.rows.gained, t.report.rows.none],
          ]}
        />
      </Section>

      <Section
        title={t.report.sections.stock}
        titleStyle="group"
        className="print:break-inside-avoid"
      >
        <Pairs rows={[[t.report.rows.stock, money.format(report.stockValueEndRappen)]]} />
      </Section>

      <Section
        title={t.report.sections.breakEven}
        titleStyle="group"
        className="print:break-inside-avoid"
      >
        <Pairs
          rows={[
            [
              t.report.rows.fixed,
              breakEven.fixedCostsRappen === undefined
                ? '–'
                : money.format(breakEven.fixedCostsRappen),
            ],
            [
              t.report.rows.contribution,
              breakEven.contributionBps === undefined
                ? '–'
                : percentText(breakEven.contributionBps),
            ],
            [
              t.report.rows.breakEven,
              breakEven.breakEvenRappen === undefined
                ? '–'
                : money.format(breakEven.breakEvenRappen),
            ],
            breakEven.reached === true
              ? [
                  t.report.rows.reached,
                  breakEven.reachedOn === undefined ? '' : formatSwissDate(breakEven.reachedOn),
                ]
              : [
                  t.report.rows.missing,
                  breakEven.neededRappen === undefined ? '–' : money.format(breakEven.neededRappen),
                ],
          ]}
        />
      </Section>

      <Section
        title={t.report.sections.dishes}
        titleStyle="group"
        className="print:break-inside-avoid"
      >
        {dishes.best.length === 0 ? (
          <p className="text-ink-muted print:text-black">{t.report.emptyDishes}</p>
        ) : (
          <div className="space-y-4">
            <DishTable caption={t.report.rows.best} rows={dishes.best} money={money} />
            {dishes.weakest.length === 0 ? null : (
              <DishTable caption={t.report.rows.weakest} rows={dishes.weakest} money={money} />
            )}
          </div>
        )}
      </Section>

      {meals.servedMeals === 0 ? null : (
        <Section
          title={t.report.sections.meals}
          titleStyle="group"
          className="print:break-inside-avoid"
        >
          <Pairs
            rows={[
              [t.report.rows.meals, String(meals.servedMeals)],
              [
                t.report.rows.perMeal,
                meals.perMealRappen === undefined ? '–' : money.format(meals.perMealRappen),
              ],
              [
                t.report.rows.targetPerMeal,
                meals.targetPerMealRappen === undefined
                  ? t.report.rows.notSet
                  : money.format(meals.targetPerMealRappen),
              ],
              [
                t.report.rows.plate,
                `${formatQuantity(meals.plateReturnGrams, 'g')}${
                  meals.plateReturnPerMealGrams === undefined
                    ? ''
                    : ` · ${formatQuantity(meals.plateReturnPerMealGrams, 'g')} je Mahlzeit`
                }`,
              ],
              [
                t.report.rows.plateValue,
                meals.plateReturnValueRappen === undefined
                  ? '–'
                  : money.format(meals.plateReturnValueRappen),
              ],
            ]}
          />
        </Section>
      )}

      <Section
        title={t.report.sections.gaps}
        titleStyle="group"
        className="print:break-inside-avoid"
      >
        <ul className="space-y-1 text-sm print:text-black">
          {incomplete.daysWithoutSales === 0 &&
          incomplete.consumptionWithoutSalesRappen === 0 &&
          incomplete.dishesWithoutCost === 0 ? (
            <li>{t.report.gaps.none}</li>
          ) : null}
          {incomplete.daysWithoutSales > 0 ? (
            <li>{t.report.gaps.sales(incomplete.daysWithoutSales)}</li>
          ) : null}
          {incomplete.consumptionWithoutSalesRappen > 0 ? (
            <li>
              {t.report.gaps.consumption(money.format(incomplete.consumptionWithoutSalesRappen))}
            </li>
          ) : null}
          {incomplete.dishesWithoutCost > 0 ? (
            <li>{t.report.gaps.dishes(incomplete.dishesWithoutCost)}</li>
          ) : null}
        </ul>
      </Section>
    </article>
  );
}

/** Two columns, label and figure, with hairlines: the look of a printed account. */
function Pairs({ rows }: { rows: readonly (readonly string[])[] }) {
  return (
    <table className="w-full border-collapse text-left text-[15px] print:text-black">
      <tbody>
        {rows.map((row) => {
          const [label = '', value = ''] = row;
          return (
            <tr key={label} className="border-b border-line print:border-black">
              <th scope="row" className="py-2 pr-4 font-normal">
                {label}
              </th>
              <td className="py-2 text-right font-semibold tabular-nums">{value}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function Table<Row extends { key: string }>({
  caption,
  rows,
  columns,
  hideCaption = false,
}: {
  caption: string;
  rows: readonly Row[];
  columns: DataTableColumn<Row>[];
  hideCaption?: boolean;
}) {
  return (
    <DataTable
      caption={caption}
      hideCaption={hideCaption}
      columns={columns}
      rows={rows}
      getRowKey={(row) => row.key}
    />
  );
}

interface DishRow {
  recipeId: string;
  name: string;
  portions: number;
  contribution: string;
  key: string;
}

function DishTable({
  caption,
  rows,
  money,
}: {
  caption: string;
  rows: MonthReport['dishes']['best'];
  money: Money;
}) {
  const data: DishRow[] = rows.map((row) => ({
    key: row.recipeId,
    recipeId: row.recipeId,
    name: row.name,
    portions: row.portions,
    contribution: money.format(row.contributionRappen),
  }));
  return (
    <Table
      caption={caption}
      rows={data}
      columns={[
        { key: 'dish', header: t.report.rows.dish, render: (row) => row.name },
        {
          key: 'portions',
          header: t.report.rows.portions,
          align: 'right',
          render: (row) => String(row.portions),
        },
        {
          key: 'contribution',
          header: t.report.rows.contributionAmount,
          align: 'right',
          render: (row) => row.contribution,
        },
      ]}
    />
  );
}
