import {
  CommandError,
  dietLabel,
  formatPercent,
  formatQuantity,
  formatSwissDate,
  formatUnitPrice,
  IdSchema,
  priceUnitLabel,
  type OperationOutput,
  type PricePoint,
} from '@randen/core';
import { Pencil } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import {
  errorText,
  isNotFound,
  useCommand,
  useMoney,
  useQueryResult,
  useToday,
} from '../../app/hooks';
import { messages } from '../../app/messages';
import { NotFoundPage } from '../../app/NotFoundPage';
import { paths } from '../../app/paths';
import { AllergenBadges, AreaBadge, ExpiryChip } from '../../ui/badges';
import { Button, ButtonLink } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { LineChart } from '../../ui/charts';
import { DataTable, type DataTableColumn } from '../../ui/DataTable';
import { GroupedList, ListRow } from '../../ui/GroupedList';
import { Notice } from '../../ui/Notice';
import { PageHeader } from '../../ui/PageHeader';
import { Section } from '../../ui/Section';
import { ConfirmDialog, Sheet } from '../../ui/Sheet';
import { KpiGrid, StatTile } from '../../ui/StatTile';
import { StatusChip } from '../../ui/StatusChip';
import { useToast } from '../../ui/Toast';
import { articlesMessages } from './messages';
import { asError, Fact } from './shared';

const t = articlesMessages.detail;
/** A link inside a line of text or a fact: quiet, but a full target for the finger. */
const LINK =
  '-my-2.5 inline-flex min-h-11 items-center rounded-lg font-semibold text-wine-800 underline-offset-2 hover:underline';

/** How many purchases the history lists before «Alle anzeigen»; the chart always draws all. */
const HISTORY_ROWS = 5;

type Detail = OperationOutput<'articles.get'>;

/** How the last purchase stands against the one before: «5 % teurer als beim Einkauf davor». */
function changeText(point: PricePoint | undefined): string | undefined {
  if (point?.changeBps === undefined) {
    return undefined;
  }
  if (point.changeBps === 0) {
    return t.priceSame;
  }
  const share = formatPercent(Math.abs(point.changeBps));
  return point.changeBps > 0 ? t.priceUp(share) : t.priceDown(share);
}

interface ArticleDetailProps {
  detail: Detail;
  /** Told before the article is deleted, so the page does not call it «nicht gefunden» meanwhile. */
  onLeaving: (leaving: boolean) => void;
}

function ArticleDetail({ detail, onLeaving }: ArticleDetailProps) {
  const { article, stock, usedIn, madeBy, priceHistory, missing, blockers } = detail;
  const money = useMoney();
  const today = useToday();
  const run = useCommand();
  const navigate = useNavigate();
  const toast = useToast();
  const [dialog, setDialog] = useState<'confirm' | 'blocked' | null>(null);
  const [wholeHistory, setWholeHistory] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const prepared = article.kind === 'prepared';
  const quantity = (value: number) => formatQuantity(value, article.unit);
  const unitPrice = (value: number, options?: { currency?: boolean }) =>
    formatUnitPrice(value, article.unit, money.currency, options);
  /** The bare number of a unit price, for the axis of the chart. */
  const priceNumber = (value: number) =>
    unitPrice(Math.round(value), { currency: false }).replace(/\s*\/.*$/, '');
  const price = article.effectivePricePer1000;
  const blocked = blockers.stock > 0 || blockers.recipes > 0 || blockers.orders > 0;

  function setActive(active: boolean, undo = true) {
    setFailure(null);
    run('articles.setActive', { articleId: article.id, active })
      .then(() => {
        toast({
          text: active ? t.activated(article.name) : t.deactivated(article.name),
          ...(undo
            ? {
                action: {
                  label: messages.actions.undo,
                  onAction: () => {
                    setActive(!active, false);
                  },
                },
              }
            : {}),
        });
      })
      .catch((error: unknown) => {
        setFailure(errorText(error));
      });
  }

  function remove() {
    setDialog(null);
    setFailure(null);
    onLeaving(true);
    run('articles.delete', { articleId: article.id })
      .then(() => {
        toast({ text: t.removed(article.name) });
        void navigate(paths.articles(), { replace: true });
      })
      .catch((error: unknown) => {
        onLeaving(false);
        // Stock or a recipe arrived in the meantime: say it in the words of the kitchen.
        setFailure(
          error instanceof CommandError && error.code === 'in_use'
            ? t.blockedGeneric
            : errorText(error),
        );
      });
  }

  const chronological = [...priceHistory].reverse();
  const historyColumns: DataTableColumn<PricePoint>[] = [
    {
      key: 'date',
      header: t.historyColumns.date,
      render: (point) => (
        <span className="block font-normal">
          <span className="block whitespace-nowrap tabular-nums">
            {formatSwissDate(point.receivedOn)}
          </span>
          {/* Quantity and supplier ride along, so the table stays narrow beside the chart. */}
          <span className="block text-[0.8125rem] text-ink-muted">
            {point.supplierName === undefined
              ? quantity(point.quantity)
              : `${quantity(point.quantity)} · ${point.supplierName}`}
          </span>
        </span>
      ),
    },
    {
      key: 'price',
      header: t.historyColumns.price,
      align: 'right',
      render: (point) => unitPrice(point.pricePer1000),
    },
    {
      key: 'change',
      header: t.historyColumns.change,
      align: 'right',
      render: (point) =>
        point.changeBps === undefined || point.changeBps === 0 ? (
          <span className="text-ink-muted">{articlesMessages.none}</span>
        ) : (
          `${point.changeBps > 0 ? '+' : '−'}${formatPercent(Math.abs(point.changeBps))}`
        ),
    },
  ];

  return (
    <>
      <PageHeader
        title={article.name}
        subtitle={
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            {article.categoryLabel}
            {prepared && article.categoryId !== 'prepared' ? ` · ${articlesMessages.prepared}` : ''}
            {article.active ? null : (
              <StatusChip tone="neutral">{articlesMessages.inactive}</StatusChip>
            )}
          </span>
        }
        back={{ to: paths.articles(), label: articlesMessages.title }}
        actions={
          <ButtonLink to={paths.articleEdit(article.id)} icon={Pencil} size="sm">
            {t.edit}
          </ButtonLink>
        }
      />

      <div className="space-y-6">
        <KpiGrid>
          <StatTile
            variant="premium"
            label={t.stock}
            value={stock.quantity > 0 ? quantity(stock.quantity) : articlesMessages.noStock}
            hint={
              stock.belowMin && article.minStock !== undefined
                ? t.belowMin(quantity(article.minStock))
                : stock.lots > 0
                  ? t.lots(stock.lots)
                  : undefined
            }
            {...(stock.belowMin ? { tone: 'soon' as const } : {})}
            to={paths.stockArticle(article.id)}
          />
          <StatTile
            label={t.stockValue}
            unit={money.symbol}
            value={money.format(stock.valueRappen, { currency: false })}
          />
          <StatTile
            label={prepared ? t.recipePrice : t.lastPrice}
            {...(price > 0 ? { unit: money.symbol } : {})}
            value={
              price > 0 ? unitPrice(price, { currency: false }) : articlesMessages.missing.price
            }
            hint={
              price === 0
                ? undefined
                : prepared && article.pricePer1000 === 0
                  ? t.fromRecipe
                  : (changeText(priceHistory[0]) ??
                    (priceHistory.length === 0 ? t.noPurchase : undefined))
            }
          />
          <StatTile
            label={t.nextDate}
            value={
              stock.next === undefined
                ? articlesMessages.none
                : formatSwissDate(stock.next.expiresOn)
            }
            hint={stock.next === undefined ? t.noDate : t.dateKinds[stock.next.dateKind]}
            trend={
              stock.next === undefined ? undefined : (
                <ExpiryChip
                  expiresOn={stock.next.expiresOn}
                  dateKind={stock.next.dateKind}
                  today={today}
                  size="sm"
                />
              )
            }
          />
        </KpiGrid>

        {article.active ? null : <Notice variant="row">{t.inactiveNotice}</Notice>}

        {missing.length === 0 ? null : (
          <Notice
            title={t.open}
            action={
              prepared && article.recipeId !== undefined ? (
                <ButtonLink to={paths.recipe(article.recipeId)} variant="secondary" size="sm">
                  {t.openRecipe}
                </ButtonLink>
              ) : (
                <ButtonLink to={paths.articleEdit(article.id)} variant="secondary" size="sm">
                  {t.complete}
                </ButtonLink>
              )
            }
          >
            <ul className="space-y-0.5">
              {missing.map((what) => (
                <li key={what}>
                  {what === 'price' && prepared ? t.openTexts.pricePrepared : t.openTexts[what]}
                </li>
              ))}
            </ul>
          </Notice>
        )}

        <div className="flex flex-col gap-6 lg:grid lg:grid-cols-3 lg:items-start">
          <div className="space-y-6 lg:col-span-2">
            <Section
              title={t.priceHistory}
              action={
                priceHistory.length > HISTORY_ROWS
                  ? {
                      label: wholeHistory
                        ? t.historyShowLess
                        : t.historyShowAll(priceHistory.length),
                      onClick: () => {
                        setWholeHistory(!wholeHistory);
                      },
                    }
                  : undefined
              }
              hint={
                priceHistory.length === 0
                  ? undefined
                  : prepared
                    ? t.productionHistoryHint(priceHistory.length)
                    : t.priceHistoryHint(priceHistory.length)
              }
            >
              {priceHistory.length === 0 ? (
                <Card>
                  <p className="text-ink-muted">{prepared ? t.noHistoryPrepared : t.noHistory}</p>
                </Card>
              ) : (
                <div className="space-y-4 xl:grid xl:grid-cols-5 xl:items-start xl:gap-4 xl:space-y-0">
                  {chronological.length < 2 ? null : (
                    <Card className="xl:col-span-2">
                      <LineChart
                        summary={t.chartSummary(
                          chronological.length,
                          unitPrice(chronological[0]?.pricePer1000 ?? 0),
                          unitPrice(chronological.at(-1)?.pricePer1000 ?? 0),
                        )}
                        categoryLabel={t.chartCategory}
                        valueLabel={t.chartValue(priceUnitLabel(article.unit))}
                        data={chronological.map((point) => ({
                          label: formatSwissDate(point.receivedOn).slice(0, 6),
                          value: point.pricePer1000,
                        }))}
                        formatValue={priceNumber}
                        height={180}
                      />
                    </Card>
                  )}
                  <div className={chronological.length < 2 ? 'xl:col-span-5' : 'xl:col-span-3'}>
                    <DataTable
                      caption={t.historyCaption}
                      hideCaption
                      columns={historyColumns}
                      rows={wholeHistory ? priceHistory : priceHistory.slice(0, HISTORY_ROWS)}
                      getRowKey={(point) => point.lotId}
                    />
                  </div>
                </div>
              )}
            </Section>

            <Section title={t.usedIn}>
              {madeBy === undefined ? null : (
                <p className="mb-3 text-ink-muted">
                  {madeBy.quantity === undefined
                    ? t.madeBy(madeBy.name)
                    : t.madeByBatch(madeBy.name, quantity(madeBy.quantity))}{' '}
                  <Link to={paths.recipe(madeBy.recipeId)} className={LINK}>
                    {t.openRecipe}
                  </Link>
                </p>
              )}
              {usedIn.length === 0 ? (
                <Card>
                  <p className="text-ink-muted">{t.usedInNone}</p>
                </Card>
              ) : (
                <GroupedList>
                  {usedIn.map((use) => {
                    const amount = formatQuantity(use.quantity, article.unit, { style: 'kitchen' });
                    return (
                      <ListRow
                        key={use.recipeId}
                        to={paths.recipe(use.recipeId)}
                        title={use.name}
                        subtitle={
                          use.kind === 'dish'
                            ? t.perPortions(amount, use.portions)
                            : t.perBatch(amount)
                        }
                        trailing={
                          use.active ? undefined : (
                            <StatusChip tone="neutral">{t.recipeInactive}</StatusChip>
                          )
                        }
                      />
                    );
                  })}
                </GroupedList>
              )}
            </Section>
          </div>

          <div className="order-first space-y-6 md:grid md:grid-cols-2 md:items-start md:gap-4 md:space-y-0 lg:order-none lg:block lg:space-y-6">
            <Section title={t.declaration} hint={prepared ? t.declarationFromRecipe : undefined}>
              <Card padding="compact">
                <dl className="divide-y divide-line">
                  <Fact label={t.contains}>
                    <AllergenBadges allergens={article.allergens} empty={t.noAllergens} />
                  </Fact>
                  {article.traces.length === 0 ? null : (
                    <Fact label={t.traces}>
                      <AllergenBadges allergens={[]} traces={article.traces} />
                    </Fact>
                  )}
                  <Fact label={t.diet}>{dietLabel(article.diet)}</Fact>
                  {article.declaresOrigin || article.originCountryName !== undefined ? (
                    <Fact label={t.origin}>
                      {article.originCountryName ?? (
                        <span className="text-ink-muted">{t.originMissing}</span>
                      )}
                    </Fact>
                  ) : null}
                </dl>
              </Card>
            </Section>

            <Section title={t.storage}>
              <Card padding="compact">
                <dl className="divide-y divide-line">
                  {prepared ? null : (
                    <Fact label={t.facts.supplier}>
                      {article.supplierId === undefined ? (
                        <span className="text-ink-muted">{t.notSet}</span>
                      ) : (
                        <Link to={paths.supplier(article.supplierId)} className={LINK}>
                          {article.supplierName}
                        </Link>
                      )}
                    </Fact>
                  )}
                  <Fact label={t.facts.area}>
                    {article.areaKind === undefined ? (
                      <span className="text-ink-muted">{t.notSet}</span>
                    ) : (
                      <AreaBadge kind={article.areaKind} name={article.areaName} />
                    )}
                  </Fact>
                  {article.spotName === undefined ? null : (
                    <Fact label={t.facts.spot}>{article.spotName}</Fact>
                  )}
                  {article.minStock === undefined ? null : (
                    <Fact label={t.facts.minStock}>{quantity(article.minStock)}</Fact>
                  )}
                  {article.targetStock === undefined ? null : (
                    <Fact label={t.facts.targetStock}>{quantity(article.targetStock)}</Fact>
                  )}
                  {article.packSize === undefined ? null : (
                    <Fact label={t.facts.pack}>
                      {article.packLabel === undefined
                        ? quantity(article.packSize)
                        : t.packWithLabel(article.packLabel, quantity(article.packSize))}
                    </Fact>
                  )}
                  {article.shelfLifeDays === undefined ? null : (
                    <Fact label={t.facts.shelfLife}>{t.days(article.shelfLifeDays)}</Fact>
                  )}
                  <Fact label={t.facts.dateKind}>{t.dateKindNames[article.dateKind]}</Fact>
                  <Fact label={t.facts.yield}>{formatPercent(article.yieldBps)}</Fact>
                  {article.supplierArticleNumber === undefined ? null : (
                    <Fact label={t.facts.supplierArticleNumber}>
                      {article.supplierArticleNumber}
                    </Fact>
                  )}
                  {article.gtin === undefined ? null : (
                    <Fact label={t.facts.gtin}>
                      <span className="tabular-nums">{article.gtin}</span>
                    </Fact>
                  )}
                </dl>
                {article.note === undefined ? null : (
                  <p className="border-t border-line py-2.5 text-[0.9375rem] whitespace-pre-line">
                    <span className="block text-ink-muted">{t.facts.note}</span>
                    {article.note}
                  </p>
                )}
              </Card>
            </Section>
          </div>
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
              onClick={() => {
                setActive(!article.active);
              }}
            >
              {article.active ? t.deactivate : t.activate}
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setDialog(blocked ? 'blocked' : 'confirm');
              }}
            >
              {t.remove}
            </Button>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={dialog === 'confirm'}
        tone="danger"
        title={t.removeTitle(article.name)}
        text={t.removeText}
        confirmLabel={t.remove}
        onConfirm={remove}
        onCancel={() => {
          setDialog(null);
        }}
      />
      <Sheet
        open={dialog === 'blocked'}
        onClose={() => {
          setDialog(null);
        }}
        title={t.blockedTitle(article.name)}
        hideClose
        footer={
          <div className="flex flex-col-reverse gap-2 md:flex-row md:justify-end">
            <Button
              variant={article.active ? 'secondary' : 'primary'}
              data-autofocus=""
              onClick={() => {
                setDialog(null);
              }}
            >
              {t.close}
            </Button>
            {article.active ? (
              <Button
                onClick={() => {
                  setDialog(null);
                  setActive(false);
                }}
              >
                {t.deactivate}
              </Button>
            ) : null}
          </div>
        }
      >
        <div className="space-y-2">
          {blockers.stock > 0 ? <p>{t.blockedStock(quantity(blockers.stock))}</p> : null}
          {blockers.recipes > 0 ? <p>{t.blockedRecipes(blockers.recipes)}</p> : null}
          {blockers.orders > 0 ? <p>{t.blockedOrders(blockers.orders)}</p> : null}
          {article.active ? <p className="text-ink-muted">{t.blockedAdvice}</p> : null}
        </div>
      </Sheet>
    </>
  );
}

/**
 * One article: what is in the house and what it is worth, what is still missing, what it
 * declares, how its price moved, and which recipes count on it.
 */
export function ArticleDetailPage() {
  const { articleId = '' } = useParams();
  const known = IdSchema.safeParse(articleId).success;
  const result = useQueryResult('articles.get', { articleId }, { enabled: known });
  const [leaving, setLeaving] = useState(false);
  if (!known) {
    return <NotFoundPage />;
  }
  if (result.status === 'ready') {
    return <ArticleDetail detail={result.data} onLeaving={setLeaving} />;
  }
  if (result.status === 'loading' || leaving) {
    return (
      <PageHeader
        title={articlesMessages.title}
        back={{ to: paths.articles(), label: articlesMessages.title }}
      />
    );
  }
  if (isNotFound(result.error)) {
    return <NotFoundPage />;
  }
  // Not a missing row: let the frame of the app say that something went wrong.
  throw asError(result.error);
}
