import { addDays, formatSwissDate, planSlotLabel, rappen } from '@randen/core';
import { CookingPot, Plus } from 'lucide-react';
import { ButtonLink } from '../../ui/Button';
import { EmptyState } from '../../ui/EmptyState';
import { GroupedList, ListRow } from '../../ui/GroupedList';
import { PageHeader } from '../../ui/PageHeader';
import { Section } from '../../ui/Section';
import { StatusChip } from '../../ui/StatusChip';
import { useDetailed } from '../../app/view';
import { useModule } from '../../app/modules';
import { useMoney, useQuery, useToday } from '../../app/hooks';
import { paths } from '../../app/paths';
import { productionMessages } from './messages';
import { mondayOfDay, useLast } from './shared';

const t = productionMessages;

/**
 * «Produktion» (pattern H1): the dishes of today that are still open in the plan, first; then
 * the runs of the last 14 days. The one main action is «Produktion erfassen».
 */
export function ProductionPage() {
  const today = useToday();
  const money = useMoney();
  const detailed = useDetailed();
  const planning = useModule('planning');
  const monday = mondayOfDay(today);
  const week = useQuery('plan.week', { weekStart: monday }, { enabled: planning });
  const runs = useLast(useQuery('production.list', { from: addDays(today, -13), to: today }));

  const open =
    week?.days.find((day) => day.date === today)?.entries.filter((entry) => !entry.produced) ?? [];

  return (
    <div className="space-y-8">
      <PageHeader
        title={t.production.title}
        actions={
          <ButtonLink to={paths.productionNew()} variant="primary" icon={Plus}>
            {t.production.newAction}
          </ButtonLink>
        }
      />

      {planning ? (
        <Section title={t.production.todayTitle}>
          {open.length === 0 ? (
            <EmptyState
              icon={CookingPot}
              title={t.production.todayTitle}
              text={t.production.todayEmpty}
              action={
                <ButtonLink to={paths.plan()} variant="secondary">
                  {t.production.planLink}
                </ButtonLink>
              }
            />
          ) : (
            <GroupedList label={t.production.todayTitle}>
              {open.map((entry) => (
                <ListRow
                  key={entry.id}
                  title={entry.recipeName}
                  subtitle={`${planSlotLabel(entry.slot)} · ${t.plan.entryMeta(entry.portions)}`}
                  trailing={
                    <ButtonLink
                      to={`${paths.productionNew(entry.recipeId)}&portions=${String(entry.portions)}&entry=${entry.id}`}
                      variant="secondary"
                      size="sm"
                    >
                      {t.production.produce}
                    </ButtonLink>
                  }
                />
              ))}
            </GroupedList>
          )}
        </Section>
      ) : null}

      <Section title={t.production.runsTitle}>
        {runs === undefined || runs.productions.length > 0 ? null : (
          <EmptyState
            icon={CookingPot}
            title={t.production.runsTitle}
            text={t.production.runsEmpty}
          />
        )}
        {runs !== undefined && runs.productions.length > 0 ? (
          <GroupedList label={t.production.runsCaption}>
            {runs.productions.map((run) => (
              <ListRow
                key={run.id}
                to={paths.productionRun(run.id)}
                title={run.outputName ?? run.recipeName}
                subtitle={`${formatSwissDate(run.producedOn)} · ${t.production.runMeta(
                  run.kind === 'component'
                    ? t.production.batches(run.portions)
                    : t.production.portionCount(run.portions),
                  run.producedByName,
                )}`}
                meta={
                  detailed ? (
                    <span className="tabular-nums">
                      {t.production.costMeta(
                        money.format(rappen(run.costRappen)),
                        money.format(rappen(run.costPerPortionRappen)),
                      )}
                    </span>
                  ) : undefined
                }
                trailing={
                  run.shortageCount > 0 ? (
                    <StatusChip tone="soon" size="sm" outline>
                      {t.production.shortageCount(run.shortageCount)}
                    </StatusChip>
                  ) : undefined
                }
              />
            ))}
          </GroupedList>
        ) : null}
      </Section>
    </div>
  );
}
