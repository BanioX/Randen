import {
  formatQuantity,
  formatSwissDate,
  relativeDays,
  rappen,
  type Id,
  type PlanDemand,
  type PlanSuggestion,
} from '@randen/core';
import { useRef, useState } from 'react';
import { errorText, useCommand, useMoney } from '../../app/hooks';
import { useModules } from '../../app/modules';
import { useDetailed } from '../../app/view';
import { paths } from '../../app/paths';
import { ButtonLink } from '../../ui/Button';
import { Button } from '../../ui/Button';
import { GroupedList, ListRow } from '../../ui/GroupedList';
import { Notice } from '../../ui/Notice';
import { Section } from '../../ui/Section';
import { useToast } from '../../ui/Toast';
import { productionMessages } from './messages';

const t = productionMessages;

/**
 * «Reste verwerten»: the dishes that use up stock about to expire, ranked by what they save. Each
 * can be put on its proposed day with one press; a dish already on the week says so.
 */
export function SuggestionsCard({
  suggestions,
  plannedDishes,
}: {
  suggestions: readonly PlanSuggestion[];
  plannedDishes: ReadonlySet<Id>;
}) {
  const detailed = useDetailed();
  const money = useMoney();
  const run = useCommand();
  const toast = useToast();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Set at once, before the state shows the wait: a second tap in between plans nothing.
  const sending = useRef(false);

  async function plan(suggestion: PlanSuggestion) {
    if (sending.current) {
      return;
    }
    sending.current = true;
    setBusy(true);
    setError(null);
    try {
      await run('plan.add', {
        date: suggestion.proposedOn,
        slot: suggestion.proposedSlot,
        recipeId: suggestion.recipeId,
        portions: suggestion.portions,
      });
      toast({
        text: t.suggest.done(suggestion.recipeName, formatSwissDate(suggestion.proposedOn)),
        tone: 'ok',
      });
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }

  return (
    <Section title={t.suggest.title} hint={t.suggest.caption}>
      {suggestions.length === 0 ? (
        <p className="text-ink-muted">{t.suggest.empty}</p>
      ) : (
        <GroupedList label={t.suggest.title}>
          {suggestions.map((suggestion) => {
            const planned = plannedDishes.has(suggestion.recipeId);
            const missing = suggestion.missing.map(
              (row) => `${row.name} ${formatQuantity(row.missing, row.unit)}`,
            );
            return (
              <ListRow
                key={`${suggestion.lotId}-${suggestion.recipeId}`}
                title={suggestion.recipeName}
                subtitle={
                  detailed
                    ? t.suggest.saves(
                        suggestion.articleName,
                        formatQuantity(suggestion.usedQuantity, suggestion.unit),
                        `läuft ${relativeDays(suggestion.daysLeft)} ab`,
                        money.format(rappen(suggestion.savedRappen)),
                      )
                    : t.suggest.uses(
                        suggestion.articleName,
                        formatQuantity(suggestion.usedQuantity, suggestion.unit),
                        `läuft ${relativeDays(suggestion.daysLeft)} ab`,
                      )
                }
                meta={
                  <span className="block">
                    {t.suggest.portions(suggestion.portions)} ·{' '}
                    {t.suggest.latest(formatSwissDate(suggestion.latestCookOn))}
                    {suggestion.ready ? '' : ` · ${t.suggest.notReady}`}
                    {missing.length === 0 ? null : (
                      <span className="block">{t.suggest.missing(missing.join(', '))}</span>
                    )}
                  </span>
                }
                trailing={
                  <Button
                    variant="secondary"
                    size="sm"
                    busy={busy}
                    disabled={planned}
                    onClick={() => {
                      void plan(suggestion);
                    }}
                  >
                    {planned ? t.suggest.planned : t.suggest.add}
                  </Button>
                }
              />
            );
          })}
        </GroupedList>
      )}
      {error === null ? null : <Notice tone="danger">{error}</Notice>}
    </Section>
  );
}

/** «Bedarf dieser Woche»: what the open dishes of the week need and the stock does not have. */
export function DemandCard({ demand }: { demand: readonly PlanDemand[] }) {
  const modules = useModules();
  const missing = demand.filter((row) => row.missing > 0);
  // The purchasing is in the navigation only with ordering or the market (nav.ts).
  const purchasing = modules.has('ordering') || modules.has('market');
  return (
    <Section title={t.demand.title} hint={t.demand.caption}>
      {missing.length === 0 ? (
        <p className="text-ink-muted">{t.demand.empty}</p>
      ) : (
        <GroupedList label={t.demand.title}>
          {missing.map((row) => (
            <ListRow
              key={row.articleId}
              title={row.name}
              subtitle={t.demand.missing(formatQuantity(row.missing, row.unit))}
              meta={`${t.demand.columns.needed} ${formatQuantity(row.needed, row.unit)}`}
            />
          ))}
        </GroupedList>
      )}
      {purchasing ? (
        <ButtonLink to={paths.purchasing()} variant="secondary" className="mt-4">
          {t.demand.link}
        </ButtonLink>
      ) : null}
    </Section>
  );
}
