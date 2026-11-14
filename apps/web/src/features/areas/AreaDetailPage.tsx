import {
  CommandError,
  formatQuantity,
  IdSchema,
  type AreaLot,
  type OperationOutput,
  type PlacedArticle,
  type SpotView,
} from '@randen/core';
import { Camera, ListChecks, MapPin, Pencil, Plus } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import {
  errorText,
  isNotFound,
  useCommand,
  useMoney,
  useQueryResult,
  useToday,
} from '../../app/hooks';
import { NotFoundPage } from '../../app/NotFoundPage';
import { paths } from '../../app/paths';
import { AreaBadge, ExpiryChip } from '../../ui/badges';
import { Button, ButtonLink } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { DataTable, type DataTableColumn } from '../../ui/DataTable';
import { DishPhoto } from '../../ui/DishPhoto';
import { Notice } from '../../ui/Notice';
import { PageHeader } from '../../ui/PageHeader';
import { ZoomablePhoto } from '../../ui/PhotoViewer';
import { Section } from '../../ui/Section';
import { ConfirmDialog, Sheet } from '../../ui/Sheet';
import { KpiGrid, StatTile } from '../../ui/StatTile';
import { useToast } from '../../ui/Toast';
import { AreaFormSheet } from './AreaFormSheet';
import { AssignSheet, type AssignTarget } from './AssignSheet';
import { areasMessages } from './messages';
import { areaLinks, rangeText, stockText } from './shared';
import { SpotSheet } from './SpotSheet';

const t = areasMessages.detail;
const c = areasMessages.counts;

type Detail = OperationOutput<'areas.get'>;

/** The address value that opens the sheet for a new spot. */
const NEW_SPOT = 'new';

/** What failed in a query, as an error the frame of the app can show. */
function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error('Query failed', { cause: error });
}

/** The articles of a spot or of the area: the name, and what of it lies here. */
function ArticleLines({ articles }: { articles: readonly PlacedArticle[] }) {
  return (
    <ul className="divide-y divide-line">
      {articles.map((article) => (
        <li
          key={article.id}
          className="flex items-baseline justify-between gap-3 py-2 text-[0.9375rem]"
        >
          <Link
            to={paths.article(article.id)}
            className="-my-2 inline-flex min-h-11 min-w-0 items-center font-medium break-words hover:underline"
          >
            {article.name}
          </Link>
          <span
            className={`shrink-0 tabular-nums ${article.stockHere > 0 ? '' : 'text-ink-muted'}`}
          >
            {stockText(article.stockHere, article.unit, t.noStockHere)}
          </span>
        </li>
      ))}
    </ul>
  );
}

interface SpotCardProps {
  spot: SpotView;
  areaName: string;
  onEdit: () => void;
  onAssign: () => void;
}

/** One spot: its photo large, its note, what lies there, and the two things one does with it. */
function SpotCard({ spot, areaName, onEdit, onAssign }: SpotCardProps) {
  return (
    <li className="flex min-w-0 flex-col rounded-2xl bg-surface p-3 shadow-card">
      {spot.photo === undefined ? (
        <button
          type="button"
          onClick={onEdit}
          className="group relative block w-full rounded-2xl text-left focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          <DishPhoto alt="" ratio="wide" icon={MapPin} className="w-full md:aspect-4/3" />
          <span className="absolute inset-x-0 bottom-3 flex justify-center">
            <span className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-surface px-3.5 text-[0.9375rem] font-semibold text-wine-800 shadow-card">
              <Camera size={18} aria-hidden="true" />
              {t.addPhoto}
              <span className="sr-only">, {spot.name}</span>
            </span>
          </span>
        </button>
      ) : (
        <ZoomablePhoto
          src={spot.photo}
          title={areasMessages.where.photo(spot.name, areaName)}
          className="aspect-video md:aspect-4/3"
        />
      )}
      <div className="flex-1 px-1 pt-3">
        <h3 className="text-lg leading-snug font-semibold break-words hyphens-calm">{spot.name}</h3>
        {spot.note === undefined ? null : (
          <p className="mt-0.5 text-[0.9375rem] whitespace-pre-line text-ink-muted">{spot.note}</p>
        )}
        <div className="mt-2">
          {spot.articles.length === 0 ? (
            <p className="py-2 text-[0.9375rem] text-ink-muted">{t.nothingAssigned}</p>
          ) : (
            <ArticleLines articles={spot.articles} />
          )}
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-2 border-t border-line px-1 pt-3">
        <Button variant="secondary" size="sm" icon={ListChecks} onClick={onAssign}>
          {t.assign}
          <span className="sr-only">, {spot.name}</span>
        </Button>
        <Button variant="ghost" size="sm" icon={Pencil} onClick={onEdit}>
          {t.editSpot}
          <span className="sr-only">, {spot.name}</span>
        </Button>
      </div>
    </li>
  );
}

type Dialog = 'edit' | 'remove' | 'blocked' | { removeSpot: SpotView } | null;

function AreaDetail({
  detail,
  onLeaving,
}: {
  detail: Detail;
  /** Told before the area is deleted, so the page does not call it «nicht gefunden» meanwhile. */
  onLeaving: (leaving: boolean) => void;
}) {
  const { area, spots, unplaced, lots, totals } = detail;
  const money = useMoney();
  const today = useToday();
  const run = useCommand();
  const toast = useToast();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [assign, setAssign] = useState<AssignTarget | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  // The spot sheet lives in the address, so the tour can link to «Foto hinzufügen».
  const spotParam = params.get('spot');
  const editing = spots.find((spot) => spot.id === spotParam);
  const spotSheetOpen = spotParam === NEW_SPOT || editing !== undefined;
  function openSpot(value: string | null) {
    const next = new URLSearchParams(params);
    if (value === null) {
      next.delete('spot');
    } else {
      next.set('spot', value);
    }
    setParams(next, { replace: true });
  }

  const range = rangeText(area);
  const articleCount = (n: number) => c.articles(n);

  function remove() {
    setDialog(null);
    setFailure(null);
    onLeaving(true);
    run('areas.delete', { areaId: area.id })
      .then(() => {
        toast({ text: t.removed(area.name) });
        void navigate(paths.areas(), { replace: true });
      })
      .catch((error: unknown) => {
        onLeaving(false);
        setFailure(
          error instanceof CommandError && error.code === 'in_use'
            ? t.blockedGeneric
            : errorText(error),
        );
      });
  }

  function removeSpot(spot: SpotView) {
    setDialog(null);
    setFailure(null);
    run('spots.delete', { spotId: spot.id })
      .then(() => {
        toast({ text: areasMessages.spot.removed(spot.name) });
      })
      .catch((error: unknown) => {
        setFailure(errorText(error));
      });
  }

  const lotColumns: DataTableColumn<AreaLot>[] = [
    {
      key: 'article',
      header: t.columns.article,
      render: (lot) => (
        <span className="block">
          <span className="block">{lot.articleName}</span>
          {lot.spotName !== undefined || lot.awayFromHome ? (
            <span className="block text-[0.8125rem] font-normal text-ink-muted">
              {lot.spotName ??
                (lot.homeAreaName === undefined ? t.awayNoHome : t.awayFrom(lot.homeAreaName))}
            </span>
          ) : null}
        </span>
      ),
    },
    {
      key: 'quantity',
      header: t.columns.quantity,
      align: 'right',
      render: (lot) => formatQuantity(lot.quantity, lot.unit),
    },
    {
      key: 'date',
      header: t.columns.date,
      render: (lot) =>
        lot.expiresOn === undefined ? (
          <span className="text-ink-muted">{t.noDate}</span>
        ) : (
          <ExpiryChip expiresOn={lot.expiresOn} dateKind={lot.dateKind} today={today} size="sm" />
        ),
    },
    {
      key: 'value',
      header: t.columns.value,
      align: 'right',
      hideBelow: 'md',
      render: (lot) => money.format(lot.valueRappen),
    },
  ];

  return (
    <>
      <PageHeader
        title={area.name}
        subtitle={
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <AreaBadge kind={area.kind} size="sm" />
            {range === undefined ? null : (
              <span className="tabular-nums">
                {range}
                {area.rangeIsProposal ? ` · ${areasMessages.range.proposal}` : ''}
              </span>
            )}
          </span>
        }
        back={{ to: paths.areas(), label: t.back }}
        actions={
          <Button
            size="sm"
            icon={Plus}
            onClick={() => {
              openSpot(NEW_SPOT);
            }}
          >
            {t.addSpot}
          </Button>
        }
      />

      <div className="space-y-6">
        <div
          className={
            area.photo === undefined
              ? ''
              : 'space-y-4 md:grid md:grid-cols-5 md:items-start md:gap-4 md:space-y-0'
          }
        >
          {area.photo === undefined ? null : (
            <ZoomablePhoto
              src={area.photo}
              title={t.photo(area.name)}
              className="aspect-video md:col-span-2"
            />
          )}
          <div className="md:col-span-3">
            <KpiGrid>
              <StatTile
                variant="premium"
                label={t.stockValue}
                unit={money.symbol}
                value={money.format(totals.stockValueRappen, { currency: false })}
                hint={
                  totals.lotCount === 0
                    ? t.noLots
                    : totals.priceMissing
                      ? `${c.lots(totals.lotCount)} · ${t.priceMissing}`
                      : c.lots(totals.lotCount)
                }
              />
              <StatTile
                label={t.spots}
                value={String(spots.length)}
                hint={c.withPhoto(totals.spotsWithPhoto)}
              />
              <StatTile
                label={t.articles}
                value={String(totals.articleCount)}
                hint={unplaced.length === 0 ? t.allPlaced : t.unplacedCount(unplaced.length)}
              />
              <StatTile
                label={t.temperature}
                value={range ?? areasMessages.none}
                hint={
                  range === undefined
                    ? t.noRange
                    : area.rangeIsProposal
                      ? areasMessages.range.proposal
                      : areasMessages.range.own
                }
              />
            </KpiGrid>
          </div>
        </div>

        <Section title={t.spots} hint={spots.length === 0 ? undefined : t.spotsHint}>
          {spots.length === 0 ? (
            <Card>
              <p className="text-ink-muted">{t.spotsEmpty}</p>
              <div className="mt-4">
                <Button
                  variant="secondary"
                  icon={Plus}
                  onClick={() => {
                    openSpot(NEW_SPOT);
                  }}
                >
                  {t.addSpot}
                </Button>
              </div>
            </Card>
          ) : (
            <ul className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {spots.map((spot) => (
                <SpotCard
                  key={spot.id}
                  spot={spot}
                  areaName={area.name}
                  onEdit={() => {
                    openSpot(spot.id);
                  }}
                  onAssign={() => {
                    setAssign({
                      areaId: area.id,
                      areaName: area.name,
                      spotId: spot.id,
                      spotName: spot.name,
                    });
                  }}
                />
              ))}
            </ul>
          )}
        </Section>

        <div className="flex flex-col gap-6 lg:grid lg:grid-cols-3 lg:items-start">
          <Section
            title={t.unplacedTitle}
            hint={unplaced.length === 0 ? undefined : t.unplacedHint}
          >
            <Card padding="compact">
              {unplaced.length === 0 ? (
                <p className="py-2 text-ink-muted">{t.unplacedEmpty}</p>
              ) : (
                <ArticleLines articles={unplaced} />
              )}
              <div className="mt-1 border-t border-line pt-3 pb-1">
                <Button
                  variant="secondary"
                  size="sm"
                  icon={ListChecks}
                  onClick={() => {
                    setAssign({ areaId: area.id, areaName: area.name, spotId: null });
                  }}
                >
                  {t.assign}
                  <span className="sr-only">, {t.unplacedTitle}</span>
                </Button>
              </div>
            </Card>
          </Section>

          <Section title={t.lotsTitle} hint={t.lotsHint} className="lg:col-span-2">
            {lots.length === 0 ? (
              <Card>
                <p className="text-ink-muted">{t.lotsEmpty}</p>
              </Card>
            ) : (
              <DataTable
                caption={t.lotsCaption}
                hideCaption
                columns={lotColumns}
                rows={lots}
                getRowKey={(lot) => lot.lotId}
                rowLink={(lot) => paths.stockArticle(lot.articleId)}
                footer={{
                  article: t.total(c.lots(totals.lotCount)),
                  value: money.format(totals.stockValueRappen),
                }}
              />
            )}
          </Section>
        </div>

        <div>
          {failure === null ? null : (
            <div className="mb-3">
              <Notice tone="danger" variant="row">
                {failure}
              </Notice>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              icon={Pencil}
              onClick={() => {
                setDialog('edit');
              }}
            >
              {t.edit}
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setDialog(totals.lotCount > 0 ? 'blocked' : 'remove');
              }}
            >
              {t.remove}
            </Button>
          </div>
        </div>
      </div>

      <AreaFormSheet
        open={dialog === 'edit'}
        area={area}
        onClose={() => {
          setDialog(null);
        }}
      />
      <SpotSheet
        open={spotSheetOpen}
        areaId={area.id}
        spot={editing}
        total={spots.length}
        onClose={() => {
          openSpot(null);
        }}
        onRemove={(spot) => {
          openSpot(null);
          setDialog({ removeSpot: spot });
        }}
      />
      <AssignSheet
        target={assign}
        onClose={() => {
          setAssign(null);
        }}
      />
      <ConfirmDialog
        open={dialog === 'remove'}
        tone="danger"
        title={t.removeTitle(area.name)}
        text={t.removeText(c.spots(spots.length), articleCount(totals.articleCount))}
        confirmLabel={t.remove}
        onConfirm={remove}
        onCancel={() => {
          setDialog(null);
        }}
      />
      <ConfirmDialog
        open={typeof dialog === 'object' && dialog !== null}
        tone="danger"
        title={
          typeof dialog === 'object' && dialog !== null
            ? areasMessages.spot.removeTitle(dialog.removeSpot.name)
            : ''
        }
        text={
          typeof dialog === 'object' && dialog !== null && dialog.removeSpot.articles.length > 0
            ? areasMessages.spot.removeText(articleCount(dialog.removeSpot.articles.length))
            : areasMessages.spot.removeTextEmpty
        }
        confirmLabel={areasMessages.spot.remove}
        onConfirm={() => {
          if (typeof dialog === 'object' && dialog !== null) {
            removeSpot(dialog.removeSpot);
          }
        }}
        onCancel={() => {
          setDialog(null);
        }}
      />
      <Sheet
        open={dialog === 'blocked'}
        onClose={() => {
          setDialog(null);
        }}
        title={t.blockedTitle(area.name)}
        hideClose
        footer={
          <div className="flex flex-col-reverse gap-2 md:flex-row md:justify-end">
            <Button
              variant="secondary"
              data-autofocus=""
              onClick={() => {
                setDialog(null);
              }}
            >
              {t.close}
            </Button>
            <ButtonLink to={areaLinks.stockOfArea(area.id)}>{t.toStock}</ButtonLink>
          </div>
        }
      >
        <p>{t.blockedText(c.lots(totals.lotCount), money.format(totals.stockValueRappen))}</p>
      </Sheet>
    </>
  );
}

/**
 * One storage area: what it is, its spots with photos and what lies there, the articles without
 * a spot, and the lots that really lie in it right now.
 */
export function AreaDetailPage() {
  const { areaId = '' } = useParams();
  const known = IdSchema.safeParse(areaId).success;
  const result = useQueryResult('areas.get', { areaId }, { enabled: known });
  const [leaving, setLeaving] = useState(false);
  if (!known) {
    return <NotFoundPage />;
  }
  if (result.status === 'ready') {
    return <AreaDetail detail={result.data} onLeaving={setLeaving} />;
  }
  if (result.status === 'loading' || leaving) {
    return <PageHeader title={areasMessages.title} back={{ to: paths.areas(), label: t.back }} />;
  }
  if (isNotFound(result.error)) {
    return <NotFoundPage />;
  }
  // Not a missing row: let the frame of the app say that something went wrong.
  throw asError(result.error);
}
