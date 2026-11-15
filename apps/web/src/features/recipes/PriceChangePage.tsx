import {
  CommandError,
  formatPercent,
  formatUnitPrice,
  type Id,
  type OperationOutput,
} from '@randen/core';
import { useState } from 'react';
import { errorText, isNotFound, useMoney, useQueryResult } from '../../app/hooks';
import { paths } from '../../app/paths';
import { MarginBadge } from '../../ui/badges';
import { Card } from '../../ui/Card';
import { GroupedList, ListRow } from '../../ui/GroupedList';
import { Notice } from '../../ui/Notice';
import { PageHeader } from '../../ui/PageHeader';
import { PercentField } from '../../ui/PercentField';
import { ArticlePicker } from '../../ui/pickers';
import { Section } from '../../ui/Section';
import { NEW_ARTICLE_ID } from './live';
import { recipesMessages } from './messages';
import { useLast } from './shared';

const t = recipesMessages.priceChange;

type Result = OperationOutput<'recipes.priceChange'>;
type Dish = Result['dishes'][number];

/** The lowest and highest change of a price the form takes: -90 % to +300 %. */
const MIN_PERCENT_BPS = -9000;
const MAX_PERCENT_BPS = 30000;

/** The sentences that sum up the change, in the order the cook reads them. */
function summaryLines({ using, worse, better }: Result['summary']): string[] {
  if (using === 0) {
    return [t.none];
  }
  return [
    t.using(using),
    ...(worse > 0 ? [t.worse(worse)] : []),
    ...(better > 0 ? [t.better(better)] : []),
    ...(worse === 0 && better === 0 ? [t.unchanged] : []),
  ];
}

/** «27.0 % → 30.1 %», or nothing while a menu price is missing. */
function shareLine(dish: Dish): string | undefined {
  const { before, after } = dish;
  if (before.foodCostBps === undefined || after.foodCostBps === undefined) {
    return undefined;
  }
  return t.share(formatPercent(before.foodCostBps), formatPercent(after.foodCostBps));
}

/** One dish: the status before and after, with the recipe's own status labels. */
function StatusPair({ dish }: { dish: Dish }) {
  return (
    <span className="flex items-center gap-1.5">
      <MarginBadge status={dish.before.status} size="sm" />
      <span aria-hidden="true" className="text-ink-muted">
        →
      </span>
      <span className="sr-only">{t.afterLabel}</span>
      <MarginBadge status={dish.after.status} size="sm" />
    </span>
  );
}

/** What the page shows when the question cannot be answered: a gap, a vanished article, a fault. */
function Failure({ error }: { error: unknown }) {
  if (isNotFound(error)) {
    return <Notice tone="soon">{t.gone}</Notice>;
  }
  if (error instanceof CommandError && error.code === 'invalid') {
    return <Notice tone="soon">{t.noPrice}</Notice>;
  }
  return <Notice tone="danger">{errorText(error)}</Notice>;
}

/**
 * «Preisänderung durchrechnen» (ADR-0016): what a changed price of one article does to the dishes.
 * A question, not a change: the page reads, computes and stores nothing. The results appear as soon
 * as an article and a change are set; there is no button.
 */
export function PriceChangePage() {
  const money = useMoney();
  const [articleId, setArticleId] = useState<Id | null>(null);
  const [percent, setPercent] = useState<number | null>(null);
  const ready = articleId !== null && percent !== null;
  const result = useQueryResult(
    'recipes.priceChange',
    { articleId: articleId ?? NEW_ARTICLE_ID, percentBps: percent ?? 0 },
    { enabled: ready },
  );
  // Keeps the last answer while the next one loads, so the page does not flash empty.
  const last = useLast(result.data);
  const data = ready && result.status !== 'error' ? last : undefined;
  const perUnit = (pricePer1000: number, unit: Result['article']['unit']) =>
    formatUnitPrice(pricePer1000, unit, money.currency);

  return (
    <>
      <PageHeader
        title={t.title}
        subtitle={t.subtitle}
        back={{ to: paths.recipes(), label: t.back }}
      />

      <Card>
        <div className="grid gap-4 md:grid-cols-2">
          <ArticlePicker
            label={t.article}
            value={articleId}
            onChange={(id) => {
              setArticleId(id);
            }}
          />
          <PercentField
            label={t.percent}
            hint={t.percentHint}
            allowNegative
            min={MIN_PERCENT_BPS}
            max={MAX_PERCENT_BPS}
            value={percent}
            onChange={setPercent}
          />
        </div>
      </Card>

      {ready ? null : <p className="mt-6 text-ink-muted">{t.ask}</p>}
      {ready && result.status === 'error' ? (
        <div className="mt-6">
          <Failure error={result.error} />
        </div>
      ) : null}

      {data === undefined ? null : (
        <div className="mt-6 space-y-6">
          <Card variant="premium">
            <p className="text-[0.8125rem] font-semibold text-cork">
              {t.newPrice(perUnit(data.article.newPricePer1000, data.article.unit))}
            </p>
            <p className="mt-1 text-sm text-mist">
              {t.todayPrice(perUnit(data.article.pricePer1000, data.article.unit))}
            </p>
            <div className="mt-4 space-y-1">
              {summaryLines(data.summary).map((line) => (
                <p key={line} className="text-[1.0625rem] leading-snug font-semibold">
                  {line}
                </p>
              ))}
            </div>
          </Card>

          {data.dishes.length === 0 ? null : (
            <Section title={t.dishes}>
              <GroupedList label={t.dishes}>
                {data.dishes.map((dish) => (
                  <ListRow
                    key={dish.id}
                    title={dish.name}
                    subtitle={shareLine(dish)}
                    trailing={<StatusPair dish={dish} />}
                    to={paths.recipe(dish.id)}
                  />
                ))}
              </GroupedList>
            </Section>
          )}
        </div>
      )}
    </>
  );
}
