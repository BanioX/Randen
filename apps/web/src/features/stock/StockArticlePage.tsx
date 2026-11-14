import {
  formatPercent,
  formatQuantity,
  formatSwissDate,
  formatUnitPrice,
  IdSchema,
  priceUnitLabel,
  roundQuantity,
  type ArticleLot,
  type Id,
} from '@randen/core';
import { PackageOpen, Plus } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useParams } from 'react-router';
import { errorText, isNotFound, useMoney, useQueryResult, useToday } from '../../app/hooks';
import { NotFoundPage } from '../../app/NotFoundPage';
import { paths } from '../../app/paths';
import { BackLink } from '../../ui/BackLink';
import { AreaBadge, ExpiryChip } from '../../ui/badges';
import { Button, ButtonLink } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { EmptyState } from '../../ui/EmptyState';
import { GroupedList, GroupedListItem } from '../../ui/GroupedList';
import { Notice } from '../../ui/Notice';
import { PageHeader } from '../../ui/PageHeader';
import { Section } from '../../ui/Section';
import { KpiGrid, StatTile } from '../../ui/StatTile';
import { StatusChip } from '../../ui/StatusChip';
import { useToast } from '../../ui/Toast';
import { useKept } from './hooks';
import { dateText } from './labels';
import { LotSheet, type LotAction } from './LotSheets';
import { stockMessages } from './messages';
import { MovementList } from './MovementList';

const t = stockMessages.article;

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-t border-line py-2.5 first:border-t-0 first:pt-0 last:pb-0">
      <dt className="text-ink-muted">{label}</dt>
      <dd className="text-right font-medium tabular-nums">{children}</dd>
    </div>
  );
}

/**
 * One article in stock: how much is there, what it is worth and what may still be used; its
 * lots in the order they leave the house, each with the three things one does with a lot; and
 * the last movements.
 */
export function StockArticlePage() {
  const params = useParams();
  const parsed = IdSchema.safeParse(params.articleId);
  const result = useQueryResult('stock.article', parsed.success ? { articleId: parsed.data } : {}, {
    enabled: parsed.success,
  });
  const kept = useKept(result.data);
  // After a change of address the query still answers for the article before for a moment.
  const data = parsed.success && kept?.article.id === parsed.data ? kept : undefined;
  const money = useMoney();
  const today = useToday();
  const toast = useToast();
  const [sheet, setSheet] = useState<{ kind: LotAction; lotId: Id } | null>(null);

  if (!parsed.success || (result.status === 'error' && isNotFound(result.error))) {
    return <NotFoundPage text={t.notFound} />;
  }
  if (result.status === 'error') {
    return (
      <p role="alert" className="text-danger">
        {errorText(result.error)}
      </p>
    );
  }
  const back = { to: paths.stock(), label: stockMessages.back };
  if (data === undefined) {
    // The name of the article is the title: until it is read, only the way back stands.
    return <BackLink {...back} />;
  }

  const { article, lots } = data;
  const quantity = (value: number) => formatQuantity(value, article.unit);
  const price = (per1000: number) => formatUnitPrice(per1000, article.unit, money.currency);
  const blocked = roundQuantity(data.quantity - data.usableQuantity);
  /** The lot that has to go first among those that may still be used. */
  const firstUsable = lots.find((lot) => !lot.mustNotUse)?.lotId;
  const open = sheet === null ? undefined : lots.find((lot) => lot.lotId === sheet.lotId);

  const lotDetail = (lot: ArticleLot) =>
    `${lot.expiresOn === undefined ? stockMessages.date.none : formatSwissDate(lot.expiresOn)}, ${quantity(lot.quantity)}`;

  return (
    <>
      <PageHeader
        title={article.name}
        back={back}
        actions={
          <ButtonLink to={paths.article(article.id)} variant="secondary">
            {t.master}
          </ButtonLink>
        }
      />
      <div className="space-y-6">
        {article.active ? null : <Notice variant="row">{t.inactive}</Notice>}
        <KpiGrid>
          <StatTile
            variant="premium"
            label={t.kpi.quantity}
            value={quantity(data.quantity)}
            hint={stockMessages.lots(lots.length)}
          />
          <StatTile
            label={t.kpi.value}
            unit={money.symbol}
            value={money.format(data.valueRappen, { currency: false })}
            hint={
              article.pricePer1000 > 0
                ? t.kpi.lastPrice(price(article.pricePer1000))
                : t.kpi.noPrice
            }
          />
          <StatTile
            label={t.kpi.usable}
            value={quantity(data.usableQuantity)}
            tone={blocked > 0 ? 'danger' : 'ok'}
            hint={blocked > 0 ? t.kpi.blocked(quantity(blocked)) : t.kpi.allUsable}
          />
          <StatTile
            label={t.kpi.minimum}
            value={article.minStock === undefined ? t.kpi.none : quantity(article.minStock)}
            tone={article.minStock === undefined ? undefined : data.belowMin ? 'soon' : 'ok'}
            hint={
              article.minStock === undefined
                ? t.kpi.noMinimum
                : data.belowMin
                  ? t.kpi.below
                  : article.targetStock === undefined
                    ? undefined
                    : t.kpi.target(quantity(article.targetStock))
            }
          />
        </KpiGrid>

        <div className="space-y-6 lg:grid lg:grid-cols-3 lg:items-start lg:gap-6 lg:space-y-0">
          <div className="space-y-6 lg:col-span-2">
            <Section title={t.lots.title} hint={lots.length > 1 ? t.lots.hint : undefined}>
              {lots.length === 0 ? (
                <EmptyState
                  icon={PackageOpen}
                  title={t.lots.emptyTitle}
                  text={t.lots.emptyText}
                  action={
                    <ButtonLink to={paths.receive()} icon={Plus}>
                      {t.lots.emptyAction}
                    </ButtonLink>
                  }
                />
              ) : (
                <GroupedList>
                  {lots.map((lot, index) => {
                    const detail = lotDetail(lot);
                    const act = (
                      kind: LotAction,
                      label: string,
                      primary: boolean,
                      className?: string,
                    ) => (
                      <Button
                        size="sm"
                        variant={primary ? 'primary' : 'secondary'}
                        className={className}
                        aria-label={t.lots.actionOf(label, detail)}
                        onClick={() => {
                          setSheet({ kind, lotId: lot.lotId });
                        }}
                      >
                        {label}
                      </Button>
                    );
                    return (
                      <GroupedListItem key={lot.lotId} inset="text">
                        <div className="px-4 py-3.5 md:flex md:items-center md:justify-between md:gap-4">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
                              <span className="text-lg font-semibold tabular-nums">
                                {lot.quantity === lot.initialQuantity
                                  ? quantity(lot.quantity)
                                  : t.lots.of(
                                      quantity(lot.quantity),
                                      quantity(lot.initialQuantity),
                                    )}
                              </span>
                              {lot.expiresOn === undefined ? (
                                <StatusChip tone="neutral">{stockMessages.date.none}</StatusChip>
                              ) : (
                                <ExpiryChip
                                  expiresOn={lot.expiresOn}
                                  dateKind={lot.dateKind}
                                  today={today}
                                />
                              )}
                              {lot.lotId === firstUsable && lots.length > 1 ? (
                                <StatusChip tone="neutral">{t.lots.first}</StatusChip>
                              ) : null}
                              <AreaBadge kind={lot.area.kind} name={lot.area.name} />
                            </div>
                            <p className="mt-1.5 text-sm text-ink-muted tabular-nums">
                              {/* One fact per line: nothing breaks inside a date or a price. */}
                              {lot.expiresOn === undefined ? null : (
                                <span className="block">
                                  {dateText(lot.expiresOn, lot.dateKind)}
                                </span>
                              )}
                              <span className="block">
                                {lot.pricePer1000 > 0
                                  ? `${price(lot.pricePer1000)} · ${stockMessages.overview.kpi.worth(money.format(lot.valueRappen))}`
                                  : t.kpi.noPrice}
                              </span>
                              <span className="block">
                                {[
                                  lot.supplierName ?? t.lots.origin[lot.origin],
                                  lot.lotCode === undefined ? '' : t.lots.code(lot.lotCode),
                                  t.lots.received(formatSwissDate(lot.receivedOn)),
                                ]
                                  .filter((part) => part !== '')
                                  .join(' · ')}
                              </span>
                            </p>
                          </div>
                          {/* Phone: the first action over the full width, the others share a
                              row. From tablet width all stand side by side. */}
                          <div className="mt-3 grid grid-cols-2 gap-2 md:mt-0 md:flex md:shrink-0">
                            {lot.mustNotUse
                              ? null
                              : act('withdraw', t.lots.withdraw, index === 0, 'col-span-2')}
                            {act('writeOff', t.lots.writeOff, index === 0 && lot.mustNotUse)}
                            {act('move', t.lots.move, false)}
                          </div>
                        </div>
                      </GroupedListItem>
                    );
                  })}
                </GroupedList>
              )}
            </Section>

            <Section
              title={t.movements.title}
              action={{ label: t.movements.all, to: paths.journal() }}
            >
              {data.movements.length === 0 ? (
                <p className="rounded-2xl bg-surface px-4 py-8 text-center text-ink-muted shadow-card">
                  {t.movements.empty}
                </p>
              ) : (
                <MovementList
                  movements={data.movements}
                  showArticle={false}
                  caption={t.movements.title}
                />
              )}
            </Section>
          </div>

          <Section title={t.facts.title}>
            <Card>
              <dl>
                <Fact label={t.facts.unit}>{priceUnitLabel(article.unit)}</Fact>
                <Fact label={t.facts.price}>
                  {article.pricePer1000 > 0 ? price(article.pricePer1000) : t.kpi.noPrice}
                </Fact>
                <Fact label={t.facts.yield}>{formatPercent(article.yieldBps)}</Fact>
                <Fact label={t.facts.supplier}>{article.supplierName ?? t.facts.missing}</Fact>
                <Fact label={t.facts.minimum}>
                  {article.minStock === undefined ? t.facts.missing : quantity(article.minStock)}
                </Fact>
                <Fact label={t.facts.target}>
                  {article.targetStock === undefined
                    ? t.facts.missing
                    : quantity(article.targetStock)}
                </Fact>
              </dl>
            </Card>
          </Section>
        </div>
      </div>

      <LotSheet
        action={sheet?.kind ?? null}
        article={{ id: article.id, name: article.name, unit: article.unit }}
        lot={open}
        onClose={() => {
          setSheet(null);
        }}
        onDone={(text) => {
          setSheet(null);
          toast({ text, tone: 'ok' });
        }}
      />
    </>
  );
}
