import { ClipboardList, Plus } from 'lucide-react';
import { useState } from 'react';
import { errorText, useCommand, useQuery } from '../../app/hooks';
import { paths } from '../../app/paths';
import { Button } from '../../ui/Button';
import { EmptyState } from '../../ui/EmptyState';
import { GroupedList, ListRow } from '../../ui/GroupedList';
import { PageHeader } from '../../ui/PageHeader';
import { Section } from '../../ui/Section';
import { useToast } from '../../ui/Toast';
import { TaskSheet } from './TaskSheet';
import { haccpMessages as t } from './messages';
import { longDay } from './shared';
import type { HygieneTaskRow } from './types';

const ORDER = ['daily', 'weekly', 'monthly'] as const;

/** Area, weekday and «pausiert», as far as the task has them. */
function subtitleOf(task: HygieneTaskRow): string | undefined {
  const parts = [
    task.areaName,
    task.weekday === undefined ? undefined : t.weekdays[task.weekday],
    task.active ? undefined : t.plan.paused,
  ].filter((part): part is string => part !== undefined);
  return parts.length === 0 ? undefined : parts.join(' · ');
}

/**
 * «Reinigungsplan» (H1): the tasks grouped by rhythm. A row opens the task in a sheet; a new task
 * comes from the header. A business without tasks is offered the starter plan.
 */
export function TasksPage() {
  const data = useQuery('hygiene.tasks', {});
  const run = useCommand();
  const toast = useToast();
  const [editing, setEditing] = useState<HygieneTaskRow | 'new' | null>(null);
  const [busy, setBusy] = useState(false);
  const header = (
    <PageHeader
      title={t.plan.title}
      back={{ to: paths.haccp(), label: t.back }}
      actions={
        <Button
          icon={Plus}
          onClick={() => {
            setEditing('new');
          }}
        >
          {t.plan.add}
        </Button>
      }
    />
  );
  if (data === undefined) {
    return header;
  }
  const sheet =
    editing === null ? null : (
      <TaskSheet
        key={editing === 'new' ? 'new' : editing.id}
        task={editing === 'new' ? undefined : editing}
        onClose={() => {
          setEditing(null);
        }}
      />
    );

  if (data.tasks.length === 0) {
    return (
      <>
        {header}
        <EmptyState
          icon={ClipboardList}
          title={t.plan.empty.title}
          text={t.plan.empty.text}
          action={
            <Button
              disabled={busy}
              onClick={() => {
                setBusy(true);
                run('hygiene.standardPlan', {})
                  .then((result) => {
                    toast({ text: t.today.offer.done(result.created), tone: 'ok' });
                  })
                  .catch((failure: unknown) => {
                    toast({ text: errorText(failure), tone: 'danger' });
                  })
                  .finally(() => {
                    setBusy(false);
                  });
              }}
            >
              {t.plan.empty.standard}
            </Button>
          }
        />
        {sheet}
      </>
    );
  }

  return (
    <>
      {header}
      <div className="space-y-6">
        {ORDER.map((frequency) => {
          const tasks = data.tasks.filter((task) => task.frequency === frequency);
          if (tasks.length === 0) {
            return null;
          }
          return (
            <Section key={frequency} title={t.frequencies[frequency]}>
              <GroupedList label={t.frequencies[frequency]}>
                {tasks.map((task) => (
                  <ListRow
                    key={task.id}
                    title={task.name}
                    subtitle={subtitleOf(task)}
                    meta={
                      task.lastDoneOn === undefined
                        ? t.plan.neverDone
                        : t.plan.lastDone(
                            longDay(task.lastDoneOn),
                            task.lastDoneByName ?? t.unknownPerson,
                          )
                    }
                    onClick={() => {
                      setEditing(task);
                    }}
                  />
                ))}
              </GroupedList>
            </Section>
          );
        })}
      </div>
      {sheet}
    </>
  );
}
