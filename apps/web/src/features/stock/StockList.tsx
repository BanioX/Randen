import { formatQuantity, sumRappen, type Id, type StockOverviewRow } from '@randen/core';
import { PackageOpen, Package, Plus } from 'lucide-react';
import { useMoney, useQuery, useToday } from '../../app/hooks';
import { paths } from '../../app/paths';
import { AreaBadge, areaLooks, ExpiryChip } from '../../ui/badges';
import { ButtonLink } from '../../ui/Button';
import { ChoiceChips } from '../../ui/ChoiceChips';
import { DataTable, type DataTableColumn } from '../../ui/DataTable';
import { EmptyState } from '../../ui/EmptyState';
import { GroupedList, ListRow } from '../../ui/GroupedList';
import { Notice } from '../../ui/Notice';
import { SearchField } from '../../ui/SearchField';
import { StatusChip } from '../../ui/StatusChip';
import { stockLinks } from './links';
import { stockMessages } from './messages';

const t = stockMessages.overview;

export type StockFilter = 'all' | 'expiring' | 'below_min';

interface StockListProps {
  rows: readonly StockOverviewRow[];
  /** Lots past their Verbrauchsdatum in the whole store: a way to the expiry list. */
  expiredCount: number;
  search: string;
  onSearch: (search: string) => void;
  areaId: Id | null;
  onArea: (areaId: Id | null) => void;
  filter: StockFilter;
  /** Where «Alle anzeigen» leads: the list without the filter of a tile. */
  unfiltered: string;
}

const ALL = 'all';

/** The chips of one row: what is due, and whether it has to be reordered. */
function RowChips({ row }: { row: StockOverviewRow }) {
  const today = useToday();
  return (
    <>
      <ExpiryChip expiresOn={row.nextExpiresOn} dateKind={row.dateKind} today={today} size="sm" />
      {row.belowMin ? (
        <StatusChip tone="soon" size="sm">
          {t.reorder}
        </StatusChip>
      ) : null}
    </>
  );
}

/**
 * «Bestand»: every article in stock. A grouped list on the phone (name, quantity, what is due),
 * a table from tablet width with value, next date and area side by side.
 */
export function StockList({
  rows,
  expiredCount,
  search,
  onSearch,
  areaId,
  onArea,
  filter,
  unfiltered,
}: StockListProps) {
  const money = useMoney();
  const today = useToday();
  const areas = useQuery('lookup.areas', {})?.areas ?? [];
  const narrowed = search.trim() !== '' || areaId !== null || filter !== 'all';

  const columns: DataTableColumn<StockOverviewRow>[] = [
    {
      key: 'name',
      header: t.table.article,
      render: (row) => (
        <span>
          {row.name}
          {/* The area has a column of its own once the screen is wide enough for it. */}
          {row.areas.length === 0 ? null : (
            <span className="block text-xs font-normal text-ink-muted lg:hidden">
              {row.areas.map((area) => area.name).join(', ')}
            </span>
          )}
        </span>
      ),
    },
    {
      key: 'quantity',
      header: t.table.quantity,
      align: 'right',
      width: '6.5rem',
      render: (row) => (
        <>
          {formatQuantity(row.quantity, row.unit)}
          {row.belowMin && row.minStock !== undefined ? (
            <span className="block text-xs font-semibold text-soon">
              {t.minimum(formatQuantity(row.minStock, row.unit))}
            </span>
          ) : null}
        </>
      ),
    },
    {
      key: 'value',
      header: t.table.value,
      align: 'right',
      width: '7.5rem',
      render: (row) => (
        <>
          {money.format(row.valueRappen)}
          {row.priceMissing ? (
            <span className="block text-xs text-ink-muted">{t.priceMissing}</span>
          ) : null}
        </>
      ),
    },
    {
      key: 'date',
      header: t.table.date,
      // Wide enough for the longest chip on one line: «MHD überschritten seit 2 Tagen».
      width: '16rem',
      render: (row) =>
        row.nextExpiresOn === undefined ? (
          <span className="text-ink-muted">{row.lotCount === 0 ? t.nothing : t.noDate}</span>
        ) : (
          <ExpiryChip expiresOn={row.nextExpiresOn} dateKind={row.dateKind} today={today} />
        ),
    },
    {
      key: 'area',
      header: t.table.area,
      hideBelow: 'lg',
      width: '12rem',
      render: (row) => (
        <span className="flex flex-wrap gap-1.5">
          {row.areas.map((area) => (
            <AreaBadge key={area.id} kind={area.kind} name={area.name} size="sm" />
          ))}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="space-y-3 md:flex md:items-start md:gap-4 md:space-y-0">
        <SearchField
          label={t.search}
          hideLabel
          placeholder={t.search}
          value={search}
          onChange={onSearch}
          className="md:w-72 md:shrink-0"
        />
        {areas.length > 1 ? (
          <ChoiceChips
            legend={t.area}
            hideLegend
            options={[
              { value: ALL, label: t.allAreas },
              ...areas.map((area) => ({ value: area.id, label: area.name })),
            ]}
            value={areaId ?? ALL}
            onChange={(value) => {
              onArea(areas.find((area) => area.id === value)?.id ?? null);
            }}
            className="md:flex-1"
          />
        ) : null}
      </div>

      {filter === 'all' ? null : (
        <Notice
          variant="row"
          action={
            <ButtonLink to={unfiltered} variant="ghost" size="sm">
              {t.showAll}
            </ButtonLink>
          }
        >
          {t.filtered[filter]}
        </Notice>
      )}
      {expiredCount > 0 && filter === 'all' ? (
        <Notice
          variant="row"
          tone="danger"
          action={
            <ButtonLink to={stockLinks.expiringGroup('expired')} variant="secondary" size="sm">
              {t.expiredLink}
            </ButtonLink>
          }
        >
          {t.expiredNotice(expiredCount)}
        </Notice>
      ) : null}

      {rows.length === 0 ? (
        narrowed ? (
          <p className="rounded-2xl bg-surface px-4 py-8 text-center text-ink-muted shadow-card">
            {t.noMatch}
          </p>
        ) : (
          <EmptyState
            icon={PackageOpen}
            title={t.emptyTitle}
            text={t.emptyText}
            action={
              <span className="flex flex-col items-stretch gap-2">
                <ButtonLink to={paths.receive()} icon={Plus}>
                  {t.emptyReceive}
                </ButtonLink>
                <ButtonLink to={stockLinks.openingStock()} variant="secondary">
                  {t.emptyOpening}
                </ButtonLink>
              </span>
            }
          />
        )
      ) : (
        <>
          <div className="md:hidden">
            <GroupedList label={t.listLabel}>
              {rows.map((row) => {
                const area = row.areas[0];
                const look = area === undefined ? undefined : areaLooks[area.kind];
                const place =
                  row.belowMin && row.minStock !== undefined
                    ? t.minimum(formatQuantity(row.minStock, row.unit))
                    : row.areas.map((each) => each.name).join(', ');
                return (
                  <ListRow
                    key={row.articleId}
                    title={row.name}
                    subtitle={[
                      row.lotCount === 0 ? t.nothing : formatQuantity(row.quantity, row.unit),
                      place,
                      row.lotCount > 1 ? stockMessages.lots(row.lotCount) : '',
                    ]
                      .filter((part) => part !== '')
                      .join(' · ')}
                    icon={look?.icon ?? Package}
                    iconTone={look?.tone ?? 'neutral'}
                    trailing={<RowChips row={row} />}
                    to={paths.stockArticle(row.articleId)}
                  />
                );
              })}
            </GroupedList>
          </div>
          <div className="hidden md:block">
            <DataTable
              caption={t.table.caption}
              hideCaption
              columns={columns}
              rows={rows}
              getRowKey={(row) => row.articleId}
              rowLink={(row) => paths.stockArticle(row.articleId)}
              footer={{
                name: `${t.table.total}: ${stockMessages.articles(rows.length)}`,
                value: money.format(sumRappen(rows.map((row) => row.valueRappen))),
              }}
            />
          </div>
        </>
      )}
    </div>
  );
}
