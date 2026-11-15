import { formatPercent, rappen, type OperationOutput, type YearMonth } from '@randen/core';
import { useState } from 'react';
import { useSearchParams } from 'react-router';
import {
  errorText,
  useBusiness,
  useCommand,
  useMoney,
  useQuery,
  useQueryResult,
  useToday,
} from '../../app/hooks';
import { paths } from '../../app/paths';
import { Card } from '../../ui/Card';
import { DataTable, type DataTableColumn } from '../../ui/DataTable';
import { FormActions } from '../../ui/FormActions';
import { MoneyField } from '../../ui/MoneyField';
import { Notice } from '../../ui/Notice';
import { PageHeader } from '../../ui/PageHeader';
import { PercentField } from '../../ui/PercentField';
import { Section } from '../../ui/Section';
import { useToast } from '../../ui/Toast';
import { BudgetProgress, MonthSwitch, percentText } from './parts';
import { numbersMessages as t } from './messages';
import { monthName, monthOf, parseMonth, shiftMonth } from './shared';

type BudgetPage = OperationOutput<'budgets.get'>;

/**
 * «Budget» of one month (docs/regeln.md H3 and H5): the form with the budget, the revenue target,
 * the target share of the goods and the fixed costs, then how the month stands, the purchases by
 * supplier and by category, and the six months before. The month is kept in the address.
 */
export function BudgetPage() {
  const today = useToday();
  const business = useBusiness();
  const [params, setParams] = useSearchParams();
  const month = parseMonth(params.get('month'), monthOf(today));
  const page = useQueryResult('budgets.get', { month });
  const figures = useQuery('numbers.budget', { month });
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
      <PageHeader title={t.budgetPage.title} back={{ to: paths.numbers(), label: t.back }} />
      <div className="space-y-8">
        <MonthSwitch
          month={month}
          previousTo={shiftMonth(month, -1)}
          nextTo={shiftMonth(month, 1)}
          onMonth={go}
        />
        {page.status === 'error' ? (
          <Notice tone="danger">{`${t.errorTitle} ${errorText(page.error)}`}</Notice>
        ) : page.data === undefined ? null : (
          <>
            <BudgetForm
              key={`${month}:${page.data.budget?.updatedAt ?? 'new'}`}
              month={month}
              data={page.data}
              targetBps={business.targetFoodCostBps}
            />
            {figures === undefined ? null : (
              <Section title={t.budget.label} titleStyle="group">
                <Card>
                  <div className="space-y-3">
                    <BudgetProgress figures={figures} />
                    {figures.projectionRappen === undefined ? null : (
                      <p className="text-sm text-ink-muted">
                        {t.budget.projection(money.format(rappen(figures.projectionRappen)))}
                      </p>
                    )}
                  </div>
                </Card>
              </Section>
            )}
            {figures === undefined ? null : <Purchases figures={figures} />}
            <History page={page.data} month={month} />
          </>
        )}
      </div>
    </>
  );
}

/** The fields of the budget, as they are saved; empty fields are left out (removed). */
interface Values {
  budget: number | null;
  revenue: number | null;
  target: number | null;
  fixed: number | null;
}

function BudgetForm({
  month,
  data,
  targetBps,
}: {
  month: YearMonth;
  data: BudgetPage;
  targetBps: number;
}) {
  const run = useCommand();
  const toast = useToast();
  const source = data.budget ?? data.proposal;
  const [values, setValues] = useState<Values>({
    budget: source?.purchaseBudgetRappen ?? null,
    revenue: source?.revenueTargetRappen ?? null,
    target: source?.targetFoodCostBps ?? null,
    fixed: source?.fixedCostsRappen ?? null,
  });
  const [error, setError] = useState<string | null>(null);

  async function save(event: { preventDefault: () => void }) {
    event.preventDefault();
    if (values.budget === null) {
      return;
    }
    try {
      await run('budgets.set', {
        month,
        purchaseBudgetRappen: values.budget,
        ...(values.revenue === null ? {} : { revenueTargetRappen: values.revenue }),
        ...(values.target === null ? {} : { targetFoodCostBps: values.target }),
        ...(values.fixed === null ? {} : { fixedCostsRappen: values.fixed }),
      });
      setError(null);
      toast({ text: t.budgetPage.form.saved(monthName(month)), tone: 'ok' });
    } catch (failure) {
      setError(errorText(failure));
    }
  }

  return (
    <form
      onSubmit={(event) => {
        void save(event);
      }}
      className="max-w-2xl space-y-6"
    >
      {data.budget === undefined && data.proposal !== undefined ? (
        <Notice tone="info">
          {t.budgetPage.form.proposal(monthName(data.proposalFrom ?? month))}
        </Notice>
      ) : null}
      <Section title={t.budgetPage.form.legend} titleStyle="group">
        <div className="grid gap-4 md:grid-cols-2">
          <MoneyField
            label={t.budgetPage.form.budget}
            hint={t.budgetPage.form.budgetHint}
            value={values.budget === null ? null : rappen(values.budget)}
            onChange={(value) => {
              setValues({ ...values, budget: value });
            }}
            required
          />
          <MoneyField
            label={t.budgetPage.form.revenue}
            hint={t.budgetPage.form.revenueHint}
            value={values.revenue === null ? null : rappen(values.revenue)}
            onChange={(value) => {
              setValues({ ...values, revenue: value });
            }}
          />
          <PercentField
            label={t.budgetPage.form.target}
            hint={t.budgetPage.form.targetHint}
            value={values.target}
            placeholder={percentText(targetBps)}
            onChange={(value) => {
              setValues({ ...values, target: value });
            }}
          />
          <MoneyField
            label={t.budgetPage.form.fixed}
            hint={t.budgetPage.form.fixedHint}
            value={values.fixed === null ? null : rappen(values.fixed)}
            onChange={(value) => {
              setValues({ ...values, fixed: value });
            }}
          />
        </div>
      </Section>
      <FormActions primaryLabel={t.budgetPage.form.save} error={error} placement="inline" />
    </form>
  );
}

interface Row {
  key: string;
  name: string;
  amount: number;
}

/** Where the purchases of the month went: by supplier, and by article category. */
function Purchases({ figures }: { figures: OperationOutput<'numbers.budget'> }) {
  const money = useMoney();
  const columns = (header: string): DataTableColumn<Row>[] => [
    { key: 'name', header, render: (row) => row.name },
    {
      key: 'amount',
      header: t.budgetPage.amount,
      align: 'right',
      render: (row) => money.format(rappen(row.amount)),
    },
  ];
  const suppliers: Row[] = figures.suppliers.map((row, index) => ({
    key: row.supplierId ?? `none-${String(index)}`,
    name: row.supplierName ?? t.budgetPage.suppliers.without,
    amount: row.purchasesRappen,
  }));
  const categories: Row[] = figures.categories.map((row, index) => ({
    key: row.categoryId ?? `none-${String(index)}`,
    name: row.categoryLabel ?? t.budgetPage.suppliers.without,
    amount: row.purchasesRappen,
  }));
  return (
    <div className="grid gap-8 md:grid-cols-2">
      <Section title={t.budgetPage.suppliers.title} titleStyle="group">
        <DataTable
          caption={t.budgetPage.suppliers.caption}
          hideCaption
          columns={columns(t.budgetPage.suppliers.supplier)}
          rows={suppliers}
          getRowKey={(row) => row.key}
          empty={<p className="p-4 text-ink-muted">{t.budgetPage.suppliers.empty}</p>}
        />
      </Section>
      <Section title={t.budgetPage.categories.title} titleStyle="group">
        <DataTable
          caption={t.budgetPage.categories.caption}
          hideCaption
          columns={columns(t.budgetPage.categories.category)}
          rows={categories}
          getRowKey={(row) => row.key}
          empty={<p className="p-4 text-ink-muted">{t.budgetPage.suppliers.empty}</p>}
        />
      </Section>
    </div>
  );
}

interface HistoryRow {
  key: string;
  month: YearMonth;
  budget: string;
  purchases: string;
  net: string;
  foodCost: string;
}

/** The six months up to this one: budget, purchases, revenue and the food cost share. */
function History({ page, month }: { page: BudgetPage; month: YearMonth }) {
  const money = useMoney();
  const rows: HistoryRow[] = page.history.map((row) => ({
    key: row.month,
    month: row.month,
    budget:
      row.budgetRappen === undefined
        ? '–'
        : money.format(rappen(row.budgetRappen), { currency: false }),
    purchases: money.format(rappen(row.purchasesRappen), { currency: false }),
    net: money.format(rappen(row.netRevenueRappen), { currency: false }),
    foodCost: row.foodCostBps === undefined ? '–' : formatPercent(row.foodCostBps),
  }));
  const columns: DataTableColumn<HistoryRow>[] = [
    { key: 'month', header: t.budgetPage.history.month, render: (row) => monthName(row.month) },
    {
      key: 'budget',
      header: t.budgetPage.history.budget,
      align: 'right',
      hideBelow: 'md',
      render: (row) => row.budget,
    },
    {
      key: 'purchases',
      header: t.budgetPage.history.purchases,
      align: 'right',
      render: (row) => row.purchases,
    },
    {
      key: 'net',
      header: t.budgetPage.history.net,
      align: 'right',
      hideBelow: 'md',
      render: (row) => row.net,
    },
    {
      key: 'foodCost',
      header: t.budgetPage.history.foodCost,
      align: 'right',
      render: (row) => row.foodCost,
    },
  ];
  return (
    <Section title={t.budgetPage.history.title} titleStyle="group">
      <DataTable
        caption={t.budgetPage.history.caption}
        hideCaption
        columns={columns}
        rows={rows}
        getRowKey={(row) => row.key}
        rowLink={(row) =>
          row.month === month ? undefined : `${paths.budget()}?month=${row.month}`
        }
      />
    </Section>
  );
}
