import type { AreaSummary } from '@randen/core';
import { ChevronRight, Footprints, MapPin, Plus } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useMoney, useQuery } from '../../app/hooks';
import { paths } from '../../app/paths';
import { AreaBadge, areaLooks } from '../../ui/badges';
import { Button, ButtonLink } from '../../ui/Button';
import { DishPhoto } from '../../ui/DishPhoto';
import { EmptyState } from '../../ui/EmptyState';
import { Notice } from '../../ui/Notice';
import { PageHeader } from '../../ui/PageHeader';
import { SearchField } from '../../ui/SearchField';
import { Section } from '../../ui/Section';
import { StatusChip } from '../../ui/StatusChip';
import { AreaFormSheet } from './AreaFormSheet';
import { areasMessages } from './messages';
import { ReorderSheet } from './ReorderSheet';
import { areaLinks, rangeText } from './shared';

const t = areasMessages;

/** The picture of an area: its photo, or a quiet tile with the symbol of its kind. */
function AreaPicture({
  area,
  className,
  ratio,
}: {
  area: AreaSummary;
  className: string;
  ratio: 'square' | 'wide';
}) {
  return (
    <DishPhoto
      photo={area.photo}
      alt=""
      ratio={ratio}
      icon={areaLooks[area.kind].icon}
      radius={ratio === 'square' ? 'md' : 'lg'}
      className={className}
    />
  );
}

/**
 * One area as a card: the whole card opens the area. On the phone a row with a small picture,
 * from the iPad a card with the picture on top.
 */
function AreaCard({ area }: { area: AreaSummary }) {
  const money = useMoney();
  const range = rangeText(area);
  return (
    <li className="min-w-0">
      <Link
        to={paths.area(area.id)}
        className="flex h-full min-h-14 items-center gap-3 rounded-2xl bg-surface p-3 shadow-card transition-colors hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 md:flex-col md:items-stretch md:gap-0"
      >
        <span className="md:hidden">
          <AreaPicture area={area} ratio="square" className="size-20" />
        </span>
        <span className="hidden md:block">
          <AreaPicture area={area} ratio="wide" className="w-full" />
        </span>
        <span className="block min-w-0 flex-1 md:px-1 md:pt-3 md:pb-1">
          <span className="flex items-start justify-between gap-2">
            <span className="text-lg leading-snug font-semibold break-words hyphens-calm">
              {area.name}
            </span>
            <ChevronRight
              size={18}
              aria-hidden="true"
              className="mt-1 shrink-0 text-ink-muted/60"
            />
          </span>
          <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
            <AreaBadge kind={area.kind} size="sm" />
            {range === undefined ? null : (
              <span className="text-sm text-ink-muted tabular-nums">
                {range}
                {area.rangeIsProposal ? ` · ${t.range.proposal}` : ''}
              </span>
            )}
          </span>
          <span className="mt-1.5 block text-sm text-ink-muted">
            {t.counts.and(t.counts.spots(area.spotCount), t.counts.articles(area.articleCount))}
          </span>
          <span className="block text-sm text-ink-muted tabular-nums">
            {area.lotCount === 0
              ? t.list.noStock
              : t.list.stock(t.counts.lots(area.lotCount), money.format(area.stockValueRappen))}
          </span>
          {area.priceMissing ? (
            <span className="mt-1.5 block">
              <StatusChip tone="neutral" size="sm" outline>
                {t.list.priceMissing}
              </StatusChip>
            </span>
          ) : null}
        </span>
      </Link>
    </li>
  );
}

/**
 * «Wo ist was?»: the search comes first, because that is what a new person needs; below it the
 * storage areas as cards, and the way into the tour.
 */
export function AreasPage() {
  const data = useQuery('areas.list', {});
  const navigate = useNavigate();
  const [text, setText] = useState('');
  const [sheet, setSheet] = useState<'create' | 'reorder' | null>(null);
  const close = () => {
    setSheet(null);
  };

  const areas = data?.areas ?? [];
  const totals = data?.totals;
  const empty = data !== undefined && areas.length === 0;

  return (
    <>
      <PageHeader
        title={t.title}
        subtitle={
          totals === undefined || empty
            ? undefined
            : t.list.subtitle(
                t.counts.areas(areas.length),
                t.counts.spots(totals.spots),
                t.counts.withPhoto(totals.spotsWithPhoto),
              )
        }
        actions={
          empty ? undefined : (
            <>
              <ButtonLink to={paths.tour()} variant="secondary" size="sm" icon={Footprints}>
                {t.list.tour}
              </ButtonLink>
              <Button
                size="sm"
                icon={Plus}
                onClick={() => {
                  setSheet('create');
                }}
              >
                {t.list.create}
              </Button>
            </>
          )
        }
      />

      <form
        role="search"
        aria-label={t.list.search}
        className="mb-6 flex items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void navigate(areaLinks.where(text));
        }}
      >
        <SearchField
          label={t.list.search}
          hideLabel
          placeholder={t.list.searchPlaceholder}
          value={text}
          onChange={setText}
          className="min-w-0 flex-1"
        />
        <Button type="submit" variant="secondary">
          {t.list.searchButton}
        </Button>
      </form>

      {data === undefined ? null : empty ? (
        <EmptyState
          icon={MapPin}
          title={t.list.emptyTitle}
          text={t.list.emptyText}
          action={
            <Button
              icon={Plus}
              onClick={() => {
                setSheet('create');
              }}
            >
              {t.list.create}
            </Button>
          }
        />
      ) : (
        <div className="space-y-4">
          <Section
            title={t.list.areas}
            action={
              areas.length > 1
                ? {
                    label: t.list.reorder,
                    onClick: () => {
                      setSheet('reorder');
                    },
                  }
                : undefined
            }
          >
            <ul className="grid gap-3 md:grid-cols-2 md:gap-4 lg:grid-cols-3">
              {areas.map((area) => (
                <AreaCard key={area.id} area={area} />
              ))}
            </ul>
          </Section>
          {totals === undefined || totals.unplacedArticles === 0 ? null : (
            <Notice
              variant="row"
              action={
                <ButtonLink to={paths.articles()} variant="ghost" size="sm">
                  {t.list.unplacedLink}
                </ButtonLink>
              }
            >
              {t.list.unplaced(t.counts.articles(totals.unplacedArticles))}
            </Notice>
          )}
        </div>
      )}

      <AreaFormSheet
        open={sheet === 'create'}
        onClose={close}
        onCreated={(areaId) => {
          void navigate(paths.area(areaId));
        }}
      />
      <ReorderSheet open={sheet === 'reorder'} areas={areas} onClose={close} />
    </>
  );
}
