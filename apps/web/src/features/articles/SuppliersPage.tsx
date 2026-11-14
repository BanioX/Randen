import type { SupplierListRow } from '@randen/core';
import { Plus, Truck } from 'lucide-react';
import { useSearchParams } from 'react-router';
import { useQuery } from '../../app/hooks';
import { paths } from '../../app/paths';
import { ButtonLink } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { DataTable, type DataTableColumn } from '../../ui/DataTable';
import { EmptyState } from '../../ui/EmptyState';
import { GroupedList, ListRow } from '../../ui/GroupedList';
import { PageHeader } from '../../ui/PageHeader';
import { SearchField } from '../../ui/SearchField';
import { StatusChip } from '../../ui/StatusChip';
import { articlesMessages } from './messages';
import { dayText, useLast } from './shared';

const t = articlesMessages.suppliers;

/**
 * «Lieferanten»: who delivers, how many articles each one stands for, and when to order next.
 * Reached from the articles, to which the header leads back.
 */
export function SuppliersPage() {
  const [params, setParams] = useSearchParams();
  const search = params.get('q') ?? '';
  const data = useLast(useQuery('suppliers.list', search.trim() === '' ? {} : { search }));
  const rows = data?.suppliers ?? [];
  const noSuppliers = data?.total === 0;

  const columns: DataTableColumn<SupplierListRow>[] = [
    { key: 'supplier', header: t.columns.supplier, render: (row) => row.name },
    {
      key: 'articles',
      header: t.columns.articles,
      align: 'right',
      render: (row) => (
        <>
          {row.articleCount}
          {row.belowMinCount === 0 ? null : (
            <span className="block text-[0.8125rem] text-soon">
              {t.belowMin(row.belowMinCount)}
            </span>
          )}
        </>
      ),
    },
    {
      key: 'nextOrder',
      header: t.columns.nextOrder,
      render: (row) => (
        <span className={row.nextOrder === undefined ? 'text-ink-muted' : ''}>
          {dayText(row.nextOrder)}
        </span>
      ),
    },
    {
      key: 'nextDelivery',
      header: t.columns.nextDelivery,
      render: (row) => (
        <span className={row.nextDelivery === undefined ? 'text-ink-muted' : ''}>
          {dayText(row.nextDelivery)}
        </span>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title={t.title}
        back={{ to: paths.articles(), label: t.toArticles }}
        actions={
          noSuppliers ? undefined : (
            <ButtonLink to={paths.supplierNew()} icon={Plus} size="sm">
              {t.create}
            </ButtonLink>
          )
        }
      />

      {data === undefined ? null : noSuppliers ? (
        <EmptyState
          icon={Truck}
          title={t.emptyTitle}
          text={t.emptyText}
          action={
            <ButtonLink to={paths.supplierNew()} icon={Plus}>
              {t.create}
            </ButtonLink>
          }
        />
      ) : (
        <>
          <SearchField
            label={t.search}
            hideLabel
            placeholder={t.searchPlaceholder}
            value={search}
            onChange={(value) => {
              setParams(value === '' ? {} : { q: value }, { replace: true });
            }}
            className="mb-4 lg:max-w-md"
          />
          {rows.length === 0 ? (
            <Card>
              <p className="text-ink-muted">{t.noMatch}</p>
            </Card>
          ) : (
            <>
              <div className="md:hidden">
                <GroupedList label={t.caption}>
                  {rows.map((row) => (
                    <ListRow
                      key={row.id}
                      to={paths.supplier(row.id)}
                      icon={Truck}
                      title={row.name}
                      subtitle={`${t.articles(row.articleCount)} · ${t.orderOn(dayText(row.nextOrder))}`}
                      trailing={
                        row.belowMinCount === 0 ? undefined : (
                          <StatusChip tone="soon">{t.belowMin(row.belowMinCount)}</StatusChip>
                        )
                      }
                    />
                  ))}
                </GroupedList>
              </div>
              <div className="hidden md:block">
                <DataTable
                  caption={t.caption}
                  hideCaption
                  columns={columns}
                  rows={rows}
                  getRowKey={(row) => row.id}
                  rowLink={(row) => paths.supplier(row.id)}
                />
              </div>
            </>
          )}
        </>
      )}
    </>
  );
}
