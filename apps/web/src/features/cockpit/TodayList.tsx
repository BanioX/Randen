import type { CockpitMealSlot, CockpitTodo } from '@randen/core';
import { useModules } from '../../app/modules';
import { useMoney } from '../../app/hooks';
import { GroupedList, ListRow } from '../../ui/GroupedList';
import { Section } from '../../ui/Section';
import { dayRows } from './day';
import { cockpitMessages } from './messages';

const t = cockpitMessages.today;

/**
 * «Heute»: what has to be done today, most urgent first, each row a way to do it, in the words
 * of the functions the business uses. When nothing is due, one calm line says so.
 */
export function TodayList({
  todo,
  meals,
}: {
  todo: readonly CockpitTodo[];
  meals: readonly CockpitMealSlot[];
}) {
  const money = useMoney();
  const rows = dayRows(todo, meals, useModules());
  return (
    <Section title={t.title} titleStyle="group">
      {rows.length === 0 ? (
        <p className="rounded-2xl bg-surface px-4 py-4 text-ink-muted shadow-card">{t.allDone}</p>
      ) : (
        <GroupedList label={t.label}>
          {rows.map((row) => (
            <ListRow
              key={row.key}
              title={row.title}
              subtitle={row.subtitle}
              icon={row.icon}
              iconTone={row.tone}
              trailing={
                row.valueRappen === undefined ? undefined : (
                  <span className="font-semibold">{money.format(row.valueRappen)}</span>
                )
              }
              to={row.to}
            />
          ))}
        </GroupedList>
      )}
    </Section>
  );
}
