import {
  ArticleCategoryIdSchema,
  ArticleListFilterSchema,
  formatQuantity,
  type ArticleListFilter,
  type ArticleListRow,
} from '@randen/core';
import { ChevronRight, Plus, Tags } from 'lucide-react';
import { Link, useSearchParams } from 'react-router';
import { useMoney, useQuery } from '../../app/hooks';
import { paths } from '../../app/paths';
import { areaLooks } from '../../ui/badges';
import { ButtonLink } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { ChoiceChips } from '../../ui/ChoiceChips';
import { DataTable, type DataTableColumn } from '../../ui/DataTable';
import { EmptyState } from '../../ui/EmptyState';
import { GroupedList, ListRow } from '../../ui/GroupedList';
import { PageHeader } from '../../ui/PageHeader';
import { SearchField } from '../../ui/SearchField';
import { SegmentedControl } from '../../ui/SegmentedControl';
import { SelectField } from '../../ui/SelectField';
import { StatusChip } from '../../ui/StatusChip';
import { articlesMessages } from './messages';
import { MissingMarks, priceText, useLast } from './shared';

const t = articlesMessages;
const VIEWS = ArticleListFilterSchema.options;
/** The chip and the option that stand for «every group of goods». */
const ALL = 'all';

/** Stock as a kitchen reads it; nothing in the house is said in words, not as «0 g». */
function stockText(row: ArticleListRow): string {
  return row.stock > 0 ? formatQuantity(row.stock, row.unit) : t.noStock;
}

/**
 * «Artikel»: everything the kitchen keeps in stock, with what is in the house, the last price
 * and where it lies. Search, view and group of goods live in the address, so «Zurück» from an
 * article shows the list as it was.
 */
export function ArticlesPage() {
  const money = useMoney();
  const [params, setParams] = useSearchParams();
  const search = params.get('q') ?? '';
  const view = ArticleListFilterSchema.safeParse(params.get('filter'));
  const filter: ArticleListFilter = view.success ? view.data : 'all';
  const chosenCategory = ArticleCategoryIdSchema.safeParse(params.get('category'));
  const categoryId = chosenCategory.success ? chosenCategory.data : undefined;

  const data = useLast(
    useQuery('articles.list', {
      filter,
      ...(search.trim() === '' ? {} : { search }),
      ...(categoryId === undefined ? {} : { categoryId }),
    }),
  );

  /** Writes one filter into the address; an empty value leaves it out. */
  function setParam(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (value === '') {
      next.delete(key);
    } else {
      next.set(key, value);
    }
    setParams(next, { replace: true });
  }

  const rows = data?.rows ?? [];
  const noArticles = data?.total === 0;

  const categories: { value: string; label: string }[] = [
    { value: ALL, label: t.list.allCategories },
    ...(data?.categories ?? []).map((category) => ({
      value: category.id,
      label: t.list.categoryWithCount(category.label, category.count),
    })),
  ];

  const columns: DataTableColumn<ArticleListRow>[] = [
    {
      key: 'article',
      header: t.list.columns.article,
      render: (row) => (
        <span className="block">
          <span className="block">{row.name}</span>
          <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.8125rem] font-normal text-ink-muted">
            {row.categoryLabel}
            {/* Price and supplier say what is missing in their own columns. */}
            <MissingMarks missing={row.missing.filter((what) => what === 'origin')} />
          </span>
        </span>
      ),
    },
    {
      key: 'stock',
      header: t.list.columns.stock,
      align: 'right',
      render: (row) => (
        <>
          <span className={row.stock > 0 ? '' : 'text-ink-muted'}>{stockText(row)}</span>
          {row.belowMin && row.minStock !== undefined ? (
            <span className="block text-[0.8125rem] text-soon">
              {t.minStock(formatQuantity(row.minStock, row.unit))}
            </span>
          ) : null}
        </>
      ),
    },
    {
      key: 'price',
      header: t.list.columns.price,
      align: 'right',
      render: (row) => (
        <span className={row.pricePer1000 > 0 ? '' : 'text-ink-muted'}>
          {priceText(row.pricePer1000, row.unit, money.currency)}
        </span>
      ),
    },
    {
      key: 'supplier',
      header: t.list.columns.supplier,
      render: (row) =>
        row.supplierName ?? (
          <span className="text-ink-muted">
            {row.missing.includes('supplier') ? t.missing.supplier : t.none}
          </span>
        ),
    },
    {
      key: 'place',
      header: t.list.columns.place,
      hideBelow: 'lg',
      render: (row) =>
        row.areaName === undefined ? (
          <span className="text-ink-muted">{t.none}</span>
        ) : (
          <>
            {row.areaName}
            {row.spotName === undefined ? null : (
              <span className="block text-[0.8125rem] text-ink-muted">{row.spotName}</span>
            )}
          </>
        ),
    },
  ];

  return (
    <>
      <PageHeader
        title={t.title}
        subtitle={
          <Link
            to={paths.suppliers()}
            className="-my-1 inline-flex min-h-11 items-center gap-0.5 rounded-lg font-semibold text-wine-800"
          >
            {t.list.suppliers}
            <ChevronRight size={18} aria-hidden="true" className="shrink-0" />
          </Link>
        }
        actions={
          noArticles ? undefined : (
            <>
              <ButtonLink to={paths.articlesImport()} variant="secondary" size="sm">
                {t.list.import}
              </ButtonLink>
              <ButtonLink to={paths.articleNew()} icon={Plus} size="sm">
                {t.list.create}
              </ButtonLink>
            </>
          )
        }
      />

      {data === undefined ? null : noArticles ? (
        <EmptyState
          icon={Tags}
          title={t.list.emptyTitle}
          text={t.list.emptyText}
          action={
            <span className="flex flex-col items-center gap-2">
              <ButtonLink to={paths.articleNew()} icon={Plus}>
                {t.list.create}
              </ButtonLink>
              <ButtonLink to={paths.articlesImport()} variant="ghost" size="sm">
                {t.list.import}
              </ButtonLink>
            </span>
          }
        />
      ) : (
        <>
          <div className="mb-3 space-y-3 lg:flex lg:items-end lg:gap-3 lg:space-y-0">
            <SearchField
              label={t.list.search}
              hideLabel
              placeholder={t.list.searchPlaceholder}
              value={search}
              onChange={(value) => {
                setParam('q', value);
              }}
              className="lg:flex-1"
            />
            <SegmentedControl
              label={t.list.view}
              hideLabel
              options={VIEWS.map((value) => ({
                value,
                label: t.list.viewWithCount(t.list.views[value], data.counts[value]),
              }))}
              value={filter}
              onChange={(value) => {
                setParam('filter', value === 'all' ? '' : value);
              }}
              className="lg:w-[34rem]"
            />
          </div>

          {/* One line on the phone, chips where there is room for them. */}
          <SelectField
            label={t.list.category}
            hideLabel
            required
            options={categories}
            value={categoryId ?? ALL}
            onChange={(value) => {
              setParam('category', value === null || value === ALL ? '' : value);
            }}
            className="mb-4 md:hidden"
          />
          <ChoiceChips
            legend={t.list.category}
            hideLegend
            options={categories}
            value={categoryId ?? ALL}
            onChange={(value) => {
              setParam('category', value === ALL ? '' : value);
            }}
            className="mb-4 hidden md:block"
          />

          {rows.length === 0 ? (
            <Card>
              <p className="text-ink-muted">
                {search.trim() === '' && categoryId === undefined
                  ? t.list.noneInView[filter]
                  : t.list.noMatch}
              </p>
            </Card>
          ) : (
            <>
              <div className="md:hidden">
                <GroupedList label={t.list.caption}>
                  {rows.map((row) => {
                    const look = row.areaKind === undefined ? undefined : areaLooks[row.areaKind];
                    return (
                      <ListRow
                        key={row.id}
                        to={paths.article(row.id)}
                        title={row.name}
                        icon={look?.icon ?? Tags}
                        iconTone={look?.tone ?? 'neutral'}
                        subtitle={
                          row.pricePer1000 > 0
                            ? `${stockText(row)} · ${priceText(row.pricePer1000, row.unit, money.currency)}`
                            : stockText(row)
                        }
                        meta={
                          row.missing.length === 0 ? undefined : (
                            <MissingMarks missing={row.missing} />
                          )
                        }
                        trailing={
                          row.belowMin ? (
                            <StatusChip tone="soon">{t.reorder}</StatusChip>
                          ) : row.active ? undefined : (
                            <StatusChip tone="neutral">{t.inactive}</StatusChip>
                          )
                        }
                      />
                    );
                  })}
                </GroupedList>
              </div>
              <div className="hidden md:block">
                <DataTable
                  caption={t.list.caption}
                  hideCaption
                  columns={columns}
                  rows={rows}
                  getRowKey={(row) => row.id}
                  rowLink={(row) => paths.article(row.id)}
                />
              </div>
            </>
          )}
        </>
      )}
    </>
  );
}
