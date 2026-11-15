import { ClipboardList, FileText, Thermometer } from 'lucide-react';
import { useState } from 'react';
import { errorText, useCommand, useQuery } from '../../app/hooks';
import { paths } from '../../app/paths';
import { Button, ButtonLink } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { Notice } from '../../ui/Notice';
import { PageHeader } from '../../ui/PageHeader';
import { GroupedList, ListRow } from '../../ui/GroupedList';
import { Section } from '../../ui/Section';
import { TemperatureBadge } from '../../ui/badges';
import { useToast } from '../../ui/Toast';
import { TodayAreas } from './TodayAreas';
import { TodayTasks } from './TodayTasks';
import { haccpMessages as t } from './messages';
import { clockText, kindText } from './shared';
import type { TodayView } from './types';

/**
 * «Selbstkontrolle» heute: the first screen of the self-control, made for wet hands and thirty
 * seconds. Temperatures of today with one field per area, the tasks of today as a checklist,
 * then what is open and the way to history, plan and report.
 */
export function HaccpPage() {
  const today = useQuery('haccp.today', {});
  return (
    <>
      <PageHeader title={t.title} subtitle={t.subtitle} />
      {today === undefined ? null : <TodayContent today={today} />}
    </>
  );
}

function TodayContent({ today }: { today: TodayView }) {
  const open = today.areas.filter((area) => area.reading === undefined);
  const doneCount = today.tasks.filter((task) => task.done).length;
  return (
    <div className="space-y-6">
      {open.length > 0 ? (
        <Notice tone="soon" variant="row">
          {t.today.open(open.map((area) => area.name).join(', '))}
        </Notice>
      ) : null}
      {today.outOfRange.length > 0 ? (
        <Notice tone="soon" variant="row">
          {t.today.outOfRange(today.outOfRange.length)}
        </Notice>
      ) : null}
      <div className="space-y-6 lg:grid lg:grid-cols-2 lg:items-start lg:gap-6 lg:space-y-0">
        <div className="min-w-0 space-y-6">
          <Section title={t.today.temperatures}>
            {today.areas.length === 0 ? (
              <Notice variant="row">{t.today.noAreas}</Notice>
            ) : (
              <TodayAreas areas={today.areas} />
            )}
          </Section>
          <Section title={t.today.food}>
            <Card>
              {today.food.length === 0 ? (
                <p className="text-ink-muted">{t.today.foodEmpty}</p>
              ) : (
                <GroupedList label={t.today.food}>
                  {today.food.map((log) => (
                    <ListRow
                      key={log.id}
                      title={log.label ?? kindText(log.kind)}
                      subtitle={`${kindText(log.kind)}, ${clockText(log.measuredAt)}, ${log.measuredByName}`}
                      meta={<TemperatureBadge deciC={log.deciC} ok={log.ok} />}
                    />
                  ))}
                </GroupedList>
              )}
              <div className="mt-4">
                <ButtonLink
                  to={`${paths.temperatures()}?kind=cooking`}
                  variant="secondary"
                  icon={Thermometer}
                >
                  {t.today.measureFood}
                </ButtonLink>
              </div>
            </Card>
          </Section>
        </div>
        <div className="min-w-0 space-y-6">
          {today.plannedTaskCount === 0 ? (
            <OfferPlan />
          ) : (
            <Section
              title={t.today.tasks}
              hint={
                today.tasks.length === 0
                  ? undefined
                  : t.today.tasksDone(doneCount, today.tasks.length)
              }
            >
              {today.tasks.length === 0 ? (
                <Notice variant="row">{t.today.noTasks}</Notice>
              ) : (
                <TodayTasks tasks={today.tasks} />
              )}
            </Section>
          )}
          <Section title={t.report.title}>
            <GroupedList label={t.report.title}>
              <ListRow to={paths.temperatures()} title={t.today.links.history} icon={Thermometer} />
              <ListRow to={paths.hygieneTasks()} title={t.today.links.plan} icon={ClipboardList} />
              <ListRow to={paths.haccpReport()} title={t.today.links.report} icon={FileText} />
            </GroupedList>
          </Section>
        </div>
      </div>
    </div>
  );
}

/** The offer of the starter plan for a business without tasks (ADR-0015: a calm start). */
function OfferPlan() {
  const run = useCommand();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  return (
    <Section title={t.plan.title}>
      <Card>
        <h3 className="text-lg font-semibold">{t.today.offer.title}</h3>
        <p className="mt-2 text-ink-muted">{t.today.offer.text}</p>
        <div className="mt-4">
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
            {t.today.offer.action}
          </Button>
        </div>
      </Card>
    </Section>
  );
}
