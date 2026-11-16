import { EXPIRY_GROUPS, IdSchema, type ExpiryGroup, type Id } from '@randen/core';
import { ClipboardCheck, ListOrdered, PackagePlus, Plus, Trash2 } from 'lucide-react';
import { useLocation, useNavigate, useSearchParams } from 'react-router';
import { useMoney, useQuery } from '../../app/hooks';
import { paths } from '../../app/paths';
import { ButtonLink } from '../../ui/Button';
import { GroupedList, ListRow } from '../../ui/GroupedList';
import { PageHeader } from '../../ui/PageHeader';
import { Section } from '../../ui/Section';
import { SegmentedControl } from '../../ui/SegmentedControl';
import { KpiGrid, StatTile } from '../../ui/StatTile';
import { ExpiryList } from './ExpiryList';
import { useKept } from './hooks';
import { stockLinks } from './links';
import { stockMessages } from './messages';
import { StockList, type StockFilter } from './StockList';

const t = stockMessages.overview;

type View = 'stock' | 'expiring';

const FILTERS: readonly StockFilter[] = ['all', 'expiring', 'below_min'];

function readFilter(value: string | null): StockFilter {
  return FILTERS.find((filter) => filter === value) ?? 'all';
}

function readGroup(value: string | null): ExpiryGroup | null {
  return EXPIRY_GROUPS.find((group) => group === value) ?? null;
}

function readId(value: string | null): Id | null {
  const parsed = IdSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/**
 * «Lager»: what is in the house and what is due. Four key figures first, then one of two views
 * of the same stock: «Bestand» per article, «Ablauf» per lot by urgency. Filters live in the
 * address, so «Zurück» shows the list as it was.
 */
export function StockPage() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const money = useMoney();
  const [params, setParams] = useSearchParams();
  const view: View = pathname.replace(/\/+$/, '') === paths.stockExpiring() ? 'expiring' : 'stock';
  const search = (params.get('q') ?? '').slice(0, 80);
  const areaId = readId(params.get('area'));
  const filter = readFilter(params.get('filter'));
  const group = readGroup(params.get('group'));

  const overview = useKept(
    useQuery(
      'stock.overview',
      view === 'stock'
        ? { search, filter, ...(areaId === null ? {} : { areaId }) }
        : { filter: 'all' },
    ),
  );
  const expiring = useKept(useQuery('stock.expiring', {}, { enabled: view === 'expiring' }));
  const totals = overview?.totals;

  function setParam(name: string, value: string | null) {
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        if (value === null || value === '') {
          next.delete(name);
        } else {
          next.set(name, value);
        }
        return next;
      },
      { replace: true },
    );
  }

  return (
    <>
      <PageHeader
        title={stockMessages.title}
        actions={
          <ButtonLink to={paths.receive()} icon={Plus}>
            {t.receive}
          </ButtonLink>
        }
      />
      <div className="space-y-5">
        {totals === undefined ? null : (
          <KpiGrid>
            <StatTile
              variant="premium"
              label={t.kpi.value}
              unit={money.symbol}
              value={money.format(totals.valueRappen, { currency: false })}
              hint={[
                totals.lotCount === 0
                  ? t.kpi.empty
                  : t.kpi.spread(totals.articleCount, totals.areaCount),
                totals.lotsWithoutPrice > 0 ? t.kpi.withoutPrice(totals.lotsWithoutPrice) : '',
              ]
                .filter((part) => part !== '')
                .join(' · ')}
            />
            <StatTile
              label={t.kpi.today}
              value={stockMessages.lots(totals.today.count)}
              tone={totals.today.count > 0 ? 'today' : 'ok'}
              hint={
                totals.today.count > 0
                  ? t.kpi.worth(money.format(totals.today.valueRappen))
                  : t.kpi.nothingDue
              }
              to={stockLinks.expiringGroup('today')}
            />
            <StatTile
              label={t.kpi.soon}
              value={stockMessages.lots(totals.soon.count)}
              tone={totals.soon.count > 0 ? 'soon' : 'ok'}
              hint={
                totals.soon.count > 0
                  ? t.kpi.worth(money.format(totals.soon.valueRappen))
                  : t.kpi.nothingDue
              }
              to={stockLinks.expiringGroup('soon')}
            />
            <StatTile
              label={t.kpi.belowMin}
              value={stockMessages.articles(totals.belowMinCount)}
              tone={totals.belowMinCount > 0 ? 'soon' : 'ok'}
              hint={totals.belowMinCount > 0 ? t.kpi.reorder : t.kpi.aboveMin}
              to={stockLinks.belowMin()}
            />
          </KpiGrid>
        )}

        <SegmentedControl
          label={t.views.label}
          hideLabel
          options={[
            { value: 'stock', label: t.views.stock },
            { value: 'expiring', label: t.views.expiring },
          ]}
          value={view}
          onChange={(next) => {
            void navigate(next === 'stock' ? paths.stock() : paths.stockExpiring());
          }}
          className="md:max-w-sm"
        />

        {view === 'stock' ? (
          overview === undefined ? null : (
            <StockList
              rows={overview.rows}
              expiredCount={overview.totals.expired.count}
              search={search}
              onSearch={(value) => {
                setParam('q', value);
              }}
              areaId={areaId}
              onArea={(value) => {
                setParam('area', value);
              }}
              filter={filter}
              unfiltered={paths.stock()}
            />
          )
        ) : expiring === undefined ? null : (
          <ExpiryList data={expiring} only={group} unfiltered={paths.stockExpiring()} />
        )}

        <Section title={t.more.title} titleStyle="group">
          <GroupedList>
            <ListRow
              title={t.more.waste}
              subtitle={t.more.wasteText}
              icon={Trash2}
              to={paths.waste()}
            />
            <ListRow
              title={t.more.count}
              subtitle={t.more.countText}
              icon={ClipboardCheck}
              to={paths.count()}
            />
            <ListRow
              title={t.more.journal}
              subtitle={t.more.journalText}
              icon={ListOrdered}
              to={paths.journal()}
            />
            <ListRow
              title={t.more.opening}
              subtitle={t.more.openingText}
              icon={PackagePlus}
              to={stockLinks.openingStock()}
            />
          </GroupedList>
        </Section>
      </div>
    </>
  );
}
