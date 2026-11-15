import { IdSchema, type Id } from '@randen/core';
import { ClipboardList, ShoppingBasket } from 'lucide-react';
import { useSearchParams } from 'react-router';
import { useQuery } from '../../app/hooks';
import { useModules } from '../../app/modules';
import { paths } from '../../app/paths';
import { ButtonLink } from '../../ui/Button';
import { PageHeader } from '../../ui/PageHeader';
import { SegmentedControl } from '../../ui/SegmentedControl';
import { purchasingLinks } from './links';
import { purchasingMessages } from './messages';
import { OpenOrdersSection, PriceWatchSection } from './OverviewSections';
import { ProposalSection } from './ProposalSection';
import { RecordPurchasePage } from './RecordPurchase';
import { ShoppingListSection } from './ShoppingListSection';

const t = purchasingMessages;

/** How far the proposal looks into the menu plan, in days. */
const HORIZONS = ['3', '7', '14'] as const;
type Horizon = (typeof HORIZONS)[number];
const isHorizon = (value: string | null): value is Horizon =>
  value !== null && (HORIZONS as readonly string[]).includes(value);

/**
 * «Einkauf» (pattern H5). Two functions share it (ADR-0015): «Bestellen» shows the order proposal
 * per supplier with the open orders, «Einkauf im Markt» the shopping list and the purchase with
 * its receipt. A kitchen that only fetches its goods sees the shopping list first. The price
 * changes belong to both. Horizon and market live in the address.
 */
function PurchasingOverview() {
  const [params, setParams] = useSearchParams();
  const modules = useModules();
  const ordering = modules.has('ordering');
  const market = modules.has('market');
  const planning = modules.has('planning');
  // A page of a function never hides itself: without either function the proposal shows.
  const withProposal = ordering || !market;
  const days: Horizon = isHorizon(params.get('days')) ? (params.get('days') as Horizon) : '7';
  const marketParam = IdSchema.safeParse(params.get('market'));
  // `?add=1` comes from the cockpit: the add sheet of the shopping list opens at once.
  const marketId: Id | undefined = marketParam.success ? marketParam.data : undefined;
  const suggestions = useQuery(
    'purchasing.suggestions',
    { horizonDays: Number(days) },
    { enabled: withProposal },
  );

  function setParam(key: string, value: string | undefined) {
    const next = new URLSearchParams(params);
    if (value === undefined) {
      next.delete(key);
    } else {
      next.set(key, value);
    }
    setParams(next, { replace: true });
  }

  const proposal = withProposal ? (
    <ProposalSection data={suggestions} withMarket={market} planning={planning} />
  ) : null;
  const shopping = market ? (
    <ShoppingListSection
      marketId={marketId}
      onMarket={(id) => {
        setParam('market', id);
      }}
      addRequested={params.get('add') === '1'}
      onAddHandled={() => {
        setParam('add', undefined);
      }}
    />
  ) : null;

  return (
    <>
      <PageHeader
        title={t.title}
        subtitle={withProposal ? t.overview.subtitleOrdering : t.overview.subtitleMarket}
        actions={
          <>
            {withProposal ? (
              <ButtonLink
                to={paths.orders()}
                variant={market ? 'secondary' : 'primary'}
                size="sm"
                icon={ClipboardList}
              >
                {t.overview.orders}
              </ButtonLink>
            ) : null}
            {market ? (
              <ButtonLink to={purchasingLinks.record(marketId)} size="sm" icon={ShoppingBasket}>
                {t.overview.record}
              </ButtonLink>
            ) : null}
          </>
        }
      />
      <div className="space-y-8">
        {withProposal && planning ? (
          <SegmentedControl
            label={t.overview.horizon}
            options={HORIZONS.map((value) => ({
              value,
              label: t.overview.horizonOption(Number(value)),
            }))}
            value={days}
            onChange={(value) => {
              setParam('days', value === '7' ? undefined : value);
            }}
            className="md:max-w-sm"
          />
        ) : null}
        {ordering ? (
          <>
            {proposal}
            {shopping}
          </>
        ) : (
          <>
            {shopping}
            {proposal}
          </>
        )}
        <div className="flex flex-col gap-8 lg:grid lg:grid-cols-2 lg:items-start lg:gap-6">
          {withProposal ? <OpenOrdersSection /> : null}
          <PriceWatchSection />
        </div>
      </div>
    </>
  );
}

/** «Einkauf», or with `?view=record` the purchase at a market. */
export function PurchasingPage() {
  const [params] = useSearchParams();
  return params.get('view') === 'record' ? <RecordPurchasePage /> : <PurchasingOverview />;
}
