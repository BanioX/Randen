import type { CockpitSetupStep, CockpitToday } from '@randen/core';
import { Circle, CircleCheck, FlaskConical } from 'lucide-react';
import { Link } from 'react-router';
import { useModules } from '../../app/modules';
import { paths } from '../../app/paths';
import { Card } from '../../ui/Card';
import { GroupedList, ListRow } from '../../ui/GroupedList';
import { Section } from '../../ui/Section';
import { StatusChip } from '../../ui/StatusChip';
import { cockpitMessages } from './messages';

const t = cockpitMessages.setup;

/** Where each first step is done. */
const stepPaths: Record<CockpitSetupStep, () => string> = {
  spots: paths.areas,
  articles: paths.articles,
  receipt: () => paths.receive(),
  recipe: paths.recipeNew,
  menu: paths.menu,
  temperature: paths.temperatures,
};

/**
 * The first steps of the functions the business uses (ADR-0015): the spots only with «Wo ist
 * was?», the menu card only with the menu card. A kitchen that fetches its goods at the market
 * books its first purchase with the receipt, not a delivery note.
 */
export function useSteps(setup: CockpitToday['setup']): CockpitToday['setup']['steps'] {
  const modules = useModules();
  return setup.steps.filter(
    (step) =>
      (step.step !== 'spots' || modules.has('places')) &&
      (step.step !== 'menu' || modules.has('menu_card')),
  );
}

/**
 * «Erste Schritte»: what a young business sets up so that the cockpit has something to say, each
 * step a link, ticked off as soon as it is done.
 */
export function FirstSteps({
  setup,
  onlyOpen = false,
}: {
  setup: CockpitToday['setup'];
  /** Under the figures of a young business: only what is still open, the count says the rest. */
  onlyOpen?: boolean;
}) {
  const modules = useModules();
  const purchase = modules.has('market') && !modules.has('ordering');
  const steps = useSteps(setup);
  const done = steps.filter((step) => step.done).length;
  const shown = onlyOpen ? steps.filter((step) => !step.done) : steps;
  return (
    <Section title={t.title} titleStyle="group" hint={t.progress(done, steps.length)}>
      <GroupedList label={t.title}>
        {shown.map((step) => {
          const words = t.steps[step.step === 'receipt' && purchase ? 'purchase' : step.step];
          return (
            <ListRow
              key={step.step}
              title={words.title}
              subtitle={typeof words.text === 'function' ? words.text(step.count ?? 0) : words.text}
              icon={step.done ? CircleCheck : Circle}
              iconTone={step.done ? 'ok' : 'neutral'}
              trailing={
                step.done ? (
                  <StatusChip tone="ok" size="sm">
                    {t.done}
                  </StatusChip>
                ) : undefined
              }
              to={stepPaths[step.step]()}
            />
          );
        })}
      </GroupedList>
    </Section>
  );
}

/**
 * The one dark card of an empty cockpit: the demo business, so that nobody has to imagine what
 * Randen looks like with a kitchen in it.
 */
export function DemoCard() {
  const t = cockpitMessages.demo;
  return (
    <Card variant="premium">
      <span
        aria-hidden="true"
        className="flex size-11 items-center justify-center rounded-xl bg-white/10 text-cork"
      >
        <FlaskConical size={22} strokeWidth={1.75} />
      </span>
      <p className="mt-4 text-[0.8125rem] font-semibold tracking-wide text-cork uppercase">
        {t.eyebrow}
      </p>
      <h2 className="mt-1 text-2xl leading-tight font-semibold">{t.title}</h2>
      <p className="mt-2 text-mist">{t.text}</p>
      {/* Schrift auf Kork in Traube, nie in Rotwein (L-08). */}
      <Link
        to={paths.demo()}
        className="mt-5 inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-cork px-5 py-2 text-center font-semibold text-grape transition-colors hover:bg-white sm:w-auto"
      >
        {t.action}
      </Link>
    </Card>
  );
}
