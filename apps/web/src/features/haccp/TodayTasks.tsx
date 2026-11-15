import { useState } from 'react';
import { errorText, useCommand } from '../../app/hooks';
import { Checkbox } from '../../ui/Checkbox';
import { GroupedList, GroupedListItem } from '../../ui/GroupedList';
import { useToast } from '../../ui/Toast';
import { haccpMessages as t } from './messages';
import { clockText } from './shared';
import type { TodayTask } from './types';

/**
 * «Aufgaben heute» (H4 on the cleaning plan): one large row per task due today. Ticking it
 * writes the check with the name and the time; the tick can be taken back at once, from the toast.
 */
export function TodayTasks({ tasks }: { tasks: TodayTask[] }) {
  const run = useCommand();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);

  async function tick(task: TodayTask, checked: boolean) {
    setBusy(task.taskId);
    try {
      if (checked) {
        await run('hygiene.check', { taskId: task.taskId });
        toast({
          text: t.today.checked(task.name),
          tone: 'ok',
          action: {
            label: t.today.undo,
            onAction: () => {
              void run('hygiene.uncheck', { taskId: task.taskId }).catch(() => undefined);
            },
          },
        });
      } else {
        await run('hygiene.uncheck', { taskId: task.taskId });
        toast({ text: t.today.unchecked(task.name) });
      }
    } catch (failure) {
      toast({ text: errorText(failure), tone: 'danger' });
    } finally {
      setBusy(null);
    }
  }

  return (
    <GroupedList label={t.today.tasks}>
      {tasks.map((task) => (
        <GroupedListItem key={task.taskId} inset="check">
          <Checkbox
            label={task.name}
            description={
              task.done && task.doneAt !== undefined && task.doneByName !== undefined
                ? t.today.doneBy(clockText(task.doneAt), task.doneByName)
                : (task.areaName ?? t.frequencies[task.frequency])
            }
            checked={task.done}
            disabled={busy === task.taskId}
            onChange={(checked) => void tick(task, checked)}
          />
        </GroupedListItem>
      ))}
    </GroupedList>
  );
}
