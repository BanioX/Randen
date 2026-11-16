import {
  asksWhereGuestsEat,
  BUSINESS_KINDS,
  businessKindLabel,
  MODULE_IDS,
  proposeSetup,
  suggestedSources,
  switchModule,
  type BusinessKind,
  type Eating,
  type GoodsSources,
  type ModuleId,
  type TeamSize,
} from '@randen/core';
import { ChevronRight } from 'lucide-react';
import { useState, type SyntheticEvent } from 'react';
import { useNavigate } from 'react-router';
import { errorText, useBusiness, useCommand } from '../../app/hooks';
import { paths } from '../../app/paths';
import { writeDetailed } from '../../app/view';
import { Button, ButtonLink } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { ChoiceTiles, MultiChoiceTiles } from '../../ui/ChoiceTiles';
import { FormActions } from '../../ui/FormActions';
import { GroupedList } from '../../ui/GroupedList';
import { PageHeader } from '../../ui/PageHeader';
import { Section } from '../../ui/Section';
import { Switch } from '../../ui/Switch';
import { TextField } from '../../ui/TextField';
import { useToast } from '../../ui/Toast';
import { settingsMessages } from './messages';

const t = settingsMessages.setup;

type Step = 'intro' | 'kind' | 'goods' | 'team' | 'eating' | 'name' | 'functions';

/** The steps for a kind: «Wo essen deine Gäste?» only where take-away is common. */
function stepsFor(kind: BusinessKind | null): Step[] {
  return [
    'intro',
    'kind',
    'goods',
    'team',
    ...(kind !== null && asksWhereGuestsEat(kind) ? (['eating'] as const) : []),
    'name',
    'functions',
  ];
}

type Source = 'pickup' | 'delivered';

/**
 * «Randen einrichten» (ADR-0015): one question per screen, so it works on the iPhone with one
 * thumb. The kind of business, where the goods come from and the size of the team propose the
 * functions; the last screen shows them with a switch each. Nothing is written before «Fertig».
 */
export function SetupPage() {
  const business = useBusiness();
  const run = useCommand();
  const toast = useToast();
  const navigate = useNavigate();

  const [step, setStep] = useState<Step>('intro');
  const [kind, setKind] = useState<BusinessKind | null>(
    business.setupAt === undefined ? null : business.kind,
  );
  const [sources, setSources] = useState<GoodsSources | null>(null);
  const [team, setTeam] = useState<TeamSize | null>(null);
  const [eating, setEating] = useState<Eating | null>(null);
  const [name, setName] = useState(business.name);
  /** The functions as the person switched them on the last screen; null: the proposal. */
  const [chosen, setChosen] = useState<ModuleId[] | null>(null);
  const [goodsError, setGoodsError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const steps = stepsFor(kind);
  const index = steps.indexOf(step);
  const counted = steps.filter((s) => s !== 'intro');
  const currentSources = sources ?? (kind === null ? null : suggestedSources(kind));
  const proposal =
    kind === null || currentSources === null || team === null
      ? null
      : proposeSetup({
          kind,
          sources: currentSources,
          team,
          ...(eating === null ? {} : { eating }),
        });
  const modules = chosen ?? proposal?.modules ?? [];

  const go = (offset: 1 | -1) => {
    const next = steps[index + offset];
    if (next !== undefined) {
      setStep(next);
      setError(null);
      window.scrollTo({ top: 0 });
    }
  };

  const answered: Record<Step, boolean> = {
    intro: true,
    kind: kind !== null,
    goods: currentSources !== null && (currentSources.pickup || currentSources.delivered),
    team: team !== null,
    eating: eating !== null,
    name: name.trim() !== '',
    functions: true,
  };

  const finish = async () => {
    if (kind === null || currentSources === null || team === null || proposal === null) {
      return;
    }
    setSaving(true);
    try {
      await run('business.setup', {
        kind,
        sources: currentSources,
        team,
        ...(eating === null ? {} : { eating }),
        name: name.trim(),
        modules,
      });
      writeDetailed(proposal.detailed);
      toast({ text: t.saved, tone: 'ok' });
      void navigate(paths.cockpit());
    } catch (caught) {
      setError(errorText(caught));
      setSaving(false);
    }
  };

  const submit = (event: SyntheticEvent) => {
    event.preventDefault();
    if (step === 'goods' && !answered.goods) {
      setGoodsError(t.goodsMissing);
      return;
    }
    if (step === 'functions') {
      void finish();
      return;
    }
    go(1);
  };

  const subtitle = step === 'intro' ? t.intro : t.step(counted.indexOf(step) + 1, counted.length);

  return (
    <div className="max-w-2xl">
      <PageHeader title={t.title} subtitle={subtitle} />
      {step === 'intro' ? (
        <div className="flex flex-col gap-3 sm:flex-row">
          <Button
            type="button"
            onClick={() => {
              setStep('kind');
            }}
          >
            {t.start}
          </Button>
          <ButtonLink to={paths.demo()} variant="secondary">
            {t.demo}
          </ButtonLink>
        </div>
      ) : (
        <form noValidate onSubmit={submit} className="space-y-8">
          {step === 'kind' ? (
            <ChoiceTiles
              legend={t.kind}
              columns={2}
              value={kind}
              onChange={(value) => {
                setKind(value);
                setSources(null);
                setChosen(null);
              }}
              options={BUSINESS_KINDS.map((value) => ({
                value,
                label: businessKindLabel(value),
                detail: settingsMessages.kindExamples[value],
              }))}
            />
          ) : null}

          {step === 'goods' && currentSources !== null ? (
            <div className="space-y-8">
              <MultiChoiceTiles<Source>
                legend={t.goods}
                hint={t.goodsHint}
                error={goodsError}
                value={(['pickup', 'delivered'] as const).filter(
                  (source) => currentSources[source],
                )}
                onChange={(value) => {
                  setGoodsError(null);
                  setChosen(null);
                  setSources({
                    ...currentSources,
                    pickup: value.includes('pickup'),
                    delivered: value.includes('delivered'),
                  });
                }}
                options={[
                  { value: 'pickup', label: t.pickup, detail: t.pickupDetail },
                  { value: 'delivered', label: t.delivered, detail: t.deliveredDetail },
                ]}
              />
              {currentSources.delivered ? (
                <ChoiceTiles<'yes' | 'no'>
                  legend={t.orders}
                  value={currentSources.orders ? 'yes' : 'no'}
                  onChange={(value) => {
                    setChosen(null);
                    setSources({ ...currentSources, orders: value === 'yes' });
                  }}
                  options={[
                    { value: 'yes', label: t.ordersYes, detail: t.ordersYesDetail },
                    { value: 'no', label: t.ordersNo, detail: t.ordersNoDetail },
                  ]}
                />
              ) : null}
            </div>
          ) : null}

          {step === 'team' ? (
            <ChoiceTiles<TeamSize>
              legend={t.team}
              value={team}
              onChange={(value) => {
                setTeam(value);
                setChosen(null);
              }}
              options={(['solo', 'small', 'large'] as const).map((value) => ({
                value,
                label: t.teamSizes[value],
              }))}
            />
          ) : null}

          {step === 'eating' ? (
            <ChoiceTiles<Eating>
              legend={t.eating}
              hint={t.eatingHint}
              value={eating}
              onChange={setEating}
              options={[
                { value: 'here', label: t.eatingHere, detail: t.eatingHereDetail },
                { value: 'away', label: t.eatingAway, detail: t.eatingAwayDetail },
              ]}
            />
          ) : null}

          {step === 'name' ? (
            <div className="space-y-3">
              <h2 className="text-xl font-semibold">{t.name}</h2>
              <TextField
                label={t.nameLabel}
                value={name}
                onChange={setName}
                required
                maxLength={80}
                autoComplete="organization"
              />
            </div>
          ) : null}

          {step === 'functions' ? (
            <Functions
              modules={modules}
              onChange={(id, on) => {
                setChosen(switchModule(modules, id, on));
              }}
            />
          ) : null}

          <FormActions
            primaryLabel={step === 'functions' ? t.done : t.next}
            primaryBusy={saving}
            primaryDisabled={step !== 'goods' && !answered[step]}
            secondaryLabel={t.back}
            onSecondary={() => {
              go(-1);
            }}
            error={error}
          />
        </form>
      )}
    </div>
  );
}

/** The last screen: what is on with a switch each, the rest folded away under «Weitere». */
function Functions({
  modules,
  onChange,
}: {
  modules: readonly ModuleId[];
  onChange: (id: ModuleId, on: boolean) => void;
}) {
  // The lists are fixed when the screen opens, so a switch does not make its row jump.
  const [initial] = useState(() => new Set(modules));
  const on = MODULE_IDS.filter((id) => initial.has(id));
  const off = MODULE_IDS.filter((id) => !initial.has(id));
  const rows = (ids: readonly ModuleId[]) => (
    <GroupedList>
      {ids.map((id) => (
        <li key={id} className="relative px-4 py-2 not-first:border-t not-first:border-line">
          <Switch
            label={settingsMessages.modules[id].title}
            description={settingsMessages.modules[id].detail}
            checked={modules.includes(id)}
            onChange={(checked) => {
              onChange(id, checked);
            }}
          />
        </li>
      ))}
    </GroupedList>
  );
  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold">{t.functions}</h2>
      <Card variant="tip">{t.always}</Card>
      <Section title={t.chosen} titleStyle="group">
        {on.length === 0 ? <p className="text-ink-muted">{t.none}</p> : rows(on)}
      </Section>
      {off.length === 0 ? null : (
        <details className="group">
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 font-semibold text-wine-700 [&::-webkit-details-marker]:hidden">
            <ChevronRight
              size={18}
              aria-hidden="true"
              className="transition-transform group-open:rotate-90"
            />
            {t.more}
          </summary>
          <div className="mt-2">{rows(off)}</div>
        </details>
      )}
    </div>
  );
}
