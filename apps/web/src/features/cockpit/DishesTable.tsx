import type { CockpitDish, CockpitToday } from '@randen/core';
import { Link } from 'react-router';
import { useMoney } from '../../app/hooks';
import { useModule } from '../../app/modules';
import { paths } from '../../app/paths';
import { MarginBadge } from '../../ui/badges';
import { Card } from '../../ui/Card';
import { DataTable, type DataTableColumn } from '../../ui/DataTable';
import { Section } from '../../ui/Section';
import { StatusChip } from '../../ui/StatusChip';
import { cockpitMessages } from './messages';

const t = cockpitMessages.dishes;

const LINK =
  'inline-flex min-h-11 items-center rounded-lg font-semibold text-wine-800 hover:underline';

/**
 * «Gerichte nach Marge»: the dishes with the highest contribution margin and those with the
 * highest food cost share, in one small table sorted by margin. The best carries the mark in
 * Traube. Dishes that cannot be ranked are named below it, never shown with a pleasant number.
 * The margin of a dish is core (ADR-0015); «Alle anzeigen» leads to the margins of the sales
 * where the business records them, else to the recipes.
 */
export function DishesTable({ dishes }: { dishes: CockpitToday['dishes'] }) {
  const sales = useModule('sales');
  const money = useMoney();
  const seen = new Set<string>();
  const rows = [...dishes.best, ...dishes.worst]
    .filter((row) => (seen.has(row.recipeId) ? false : (seen.add(row.recipeId), true)))
    .sort((a, b) => b.marginRappen - a.marginRappen || a.name.localeCompare(b.name, 'de-CH'));
  // A mark needs something to stand out from.
  const bestId = rows.length > 1 ? dishes.best[0]?.recipeId : undefined;

  const columns: DataTableColumn<CockpitDish>[] = [
    {
      key: 'dish',
      header: t.columns.dish,
      render: (row) => (
        <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
          <span>{row.name}</span>
          {row.recipeId === bestId ? (
            <StatusChip tone="grape" size="sm">
              {t.best}
            </StatusChip>
          ) : null}
        </span>
      ),
    },
    {
      key: 'price',
      header: t.columns.price,
      align: 'right',
      hideBelow: 'md',
      render: (row) => money.format(row.priceRappen),
    },
    {
      key: 'cost',
      header: t.columns.cost,
      align: 'right',
      hideBelow: 'lg',
      render: (row) => money.format(row.costPerPortionRappen),
    },
    {
      key: 'margin',
      header: t.columns.margin,
      align: 'right',
      render: (row) => money.format(row.marginRappen),
    },
    {
      key: 'status',
      header: t.columns.status,
      align: 'right',
      render: (row) => (
        <MarginBadge status={row.status} foodCostBps={row.foodCostBps} short size="sm" />
      ),
    },
  ];

  const gaps = [
    dishes.withoutPrice > 0 ? t.withoutPrice(dishes.withoutPrice) : '',
    dishes.withoutCost > 0 ? t.withoutCost(dishes.withoutCost) : '',
  ].filter((gap) => gap !== '');

  return (
    <Section
      title={t.title}
      titleStyle="group"
      action={
        rows.length === 0
          ? undefined
          : { label: t.all, to: sales ? paths.margins() : paths.recipes() }
      }
    >
      {rows.length === 0 ? (
        <Card>
          <p className="text-ink-muted">{t.none}</p>
          <Link to={paths.recipeNew()} className={`${LINK} mt-1`}>
            {t.newRecipe}
          </Link>
        </Card>
      ) : (
        <DataTable
          columns={columns}
          rows={rows}
          getRowKey={(row) => row.recipeId}
          caption={t.caption}
          hideCaption
          rowLink={(row) => paths.recipe(row.recipeId)}
        />
      )}
      {gaps.length === 0 ? null : (
        <p className="mt-2 flex flex-wrap items-center gap-x-3 px-4 text-sm text-ink-muted">
          <span>{gaps.join(' · ')}</span>
          <Link to={`${paths.recipes()}?filter=incomplete`} className={LINK}>
            {t.incomplete}
          </Link>
        </p>
      )}
    </Section>
  );
}
