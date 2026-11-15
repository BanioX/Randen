import type { CockpitToday } from '@randen/core';
import { Plus } from 'lucide-react';
import { useSearchParams } from 'react-router';
import { errorText, useQueryResult, useToday } from '../../app/hooks';
import { useModules } from '../../app/modules';
import { paths } from '../../app/paths';
import { useDetailed } from '../../app/view';
import { ButtonLink } from '../../ui/Button';
import { Notice } from '../../ui/Notice';
import { PageHeader } from '../../ui/PageHeader';
import { SetupPrompt } from '../settings/SetupPrompt';
import { CockpitSearch } from './CockpitSearch';
import { DishesTable } from './DishesTable';
import { DemoCard, FirstSteps, useSteps } from './FirstSteps';
import { KeyFigures } from './KeyFigures';
import { cockpitMessages } from './messages';
import { BudgetCard, WasteCard } from './NumbersSide';
import { dateInWords } from './shared';
import { TodayList } from './TodayList';
import { UseUpList } from './UseUpList';

const t = cockpitMessages;

/**
 * «Cockpit», the first screen (docs/regeln.md H5, C4): first what has to be done today, then how
 * the kitchen stands. It reads everything and writes nothing. An empty business gets its first
 * steps and the demo business instead of empty charts. Until the business went through «Randen
 * einrichten» (ADR-0015), the offer to do so stands on top.
 */
export function CockpitPage() {
  const today = useToday();
  const modules = useModules();
  const result = useQueryResult('cockpit.today', {});
  // Words follow the business: a kitchen that fetches its goods and orders nothing books a
  // purchase with its receipt. Both lead to the same page.
  const purchase = modules.has('market') && !modules.has('ordering');

  return (
    <>
      <PageHeader
        title={t.title}
        subtitle={dateInWords(today)}
        actions={
          <ButtonLink to={paths.receive()} icon={Plus}>
            {purchase ? t.purchase : t.receive}
          </ButtonLink>
        }
      />
      <div className="space-y-8">
        <SetupPrompt />
        {result.status === 'error' ? (
          <Notice tone="danger">{`${t.failed} ${errorText(result.error)}`}</Notice>
        ) : result.data === undefined ? null : result.data.setup.empty ? (
          <EmptyCockpit setup={result.data.setup} />
        ) : (
          <Dashboard data={result.data} />
        )}
      </div>
    </>
  );
}

/**
 * The day, the figures, what to use up, and beside it the month of «Budget und Zahlen». Which
 * section belongs to the core and which to a function is said at each one (ADR-0015); charts
 * and the ranking of the dishes are evaluations and show with «Erweitert».
 */
function Dashboard({ data }: { data: CockpitToday }) {
  const [params, setParams] = useSearchParams();
  const modules = useModules();
  const detailed = useDetailed();
  const numbers = modules.has('numbers');
  const text = (params.get('q') ?? '').slice(0, 80);
  const steps = useSteps(data.setup);
  const stepsOpen = steps.some((step) => !step.done);
  const budget = numbers;
  const waste = numbers && detailed;

  return (
    <>
      <CockpitSearch
        text={text}
        onText={(value) => {
          setParams(
            (current) => {
              const next = new URLSearchParams(current);
              if (value === '') {
                next.delete('q');
              } else {
                next.set('q', value);
              }
              return next;
            },
            { replace: true },
          );
        }}
        places={modules.has('places')}
      />
      <TodayList todo={data.todo} meals={data.meals.slots} />
      <KeyFigures figures={data.figures} />
      {/* iPad upright: what to use up across the width, budget and write-offs side by side.
          iPad on its side and the web: what to use up beside budget and write-offs. */}
      {budget || waste ? (
        <div className="space-y-8 lg:grid lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:items-start lg:gap-6 lg:space-y-0">
          <UseUpList useUp={data.useUp} />
          <div
            className={`space-y-8 lg:block lg:space-y-8 ${budget && waste ? 'md:grid md:grid-cols-2 md:items-start md:gap-6 md:space-y-0' : ''}`}
          >
            {budget ? <BudgetCard figures={data.figures} /> : null}
            {waste ? <WasteCard waste={data.wasteByKind} /> : null}
          </div>
        </div>
      ) : (
        <UseUpList useUp={data.useUp} />
      )}
      {detailed ? <DishesTable dishes={data.dishes} /> : null}
      {data.setup.young && stepsOpen ? <FirstSteps setup={data.setup} onlyOpen /> : null}
    </>
  );
}

/** A business without articles and recipes: the demo business, then the first steps. */
function EmptyCockpit({ setup }: { setup: CockpitToday['setup'] }) {
  return (
    <div className="space-y-8 md:grid md:grid-cols-2 md:items-start md:gap-6 md:space-y-0 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
      <DemoCard />
      <FirstSteps setup={setup} />
    </div>
  );
}
