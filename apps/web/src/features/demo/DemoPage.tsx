import { formatDecimal, formatSwissDate, type OperationOutput } from '@randen/core';
import {
  BookOpen,
  Boxes,
  CalendarDays,
  ChartColumn,
  ChefHat,
  CookingPot,
  LayoutDashboard,
  MapPin,
  Package,
  Receipt,
  Soup,
  ThermometerSnowflake,
  Truck,
  Users,
  UtensilsCrossed,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { errorText, useCommand, useQueryResult } from '../../app/hooks';
import { NotFoundPage } from '../../app/NotFoundPage';
import { paths } from '../../app/paths';
import { Button, ButtonLink } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { GroupedList, ListRow } from '../../ui/GroupedList';
import { Notice } from '../../ui/Notice';
import { PageHeader } from '../../ui/PageHeader';
import { Section } from '../../ui/Section';
import { ConfirmDialog } from '../../ui/Sheet';
import { KpiGrid, StatTile } from '../../ui/StatTile';
import { useToast } from '../../ui/Toast';
import { demoMessages as t } from './messages';

type Status = OperationOutput<'demo.status'>;

/** After the demo is gone the app starts over: a fresh, empty business is made on the next start. */
function startOver() {
  window.location.assign(paths.cockpit());
}

interface DemoPageProps {
  /** What happens once the demo data is removed; the app reloads (tests pass their own). */
  onCleared?: () => void;
}

/**
 * The demo business (pattern H2): what it is and what it holds, the one action that loads it
 * into an empty business, and at the end the way to remove it again. `?load=1` loads it at
 * once, for the preview pictures.
 */
export function DemoPage({ onCleared = startOver }: DemoPageProps) {
  const result = useQueryResult('demo.status', {});
  const run = useCommand();
  const toast = useToast();
  const navigate = useNavigate();
  const [search] = useSearchParams();
  const [state, setState] = useState<'idle' | 'loading' | 'clearing'>('idle');
  const [confirming, setConfirming] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const autoLoaded = useRef(false);

  const status = result.data;
  const canLoad = status !== undefined && status.empty && !status.demo;

  function load(then?: () => void) {
    setFailure(null);
    setState('loading');
    run('demo.load', { confirm: true })
      .then((loaded) => {
        setState('idle');
        toast({
          text: t.loaded(loaded.counts.articles, loaded.counts.dishes, status?.contents.weeks ?? 8),
          tone: 'ok',
        });
        then?.();
      })
      .catch((error: unknown) => {
        setState('idle');
        setFailure(errorText(error));
      });
  }

  // The preview pictures open `?load=1` on a fresh device: load once, then show the cockpit.
  useEffect(() => {
    if (search.get('load') === '1' && canLoad && !autoLoaded.current) {
      autoLoaded.current = true;
      load(() => {
        void navigate(paths.cockpit(), { replace: true });
      });
    }
  });

  function clear() {
    setConfirming(false);
    setFailure(null);
    setState('clearing');
    run('demo.clear', { confirm: true })
      .then(() => {
        onCleared();
      })
      .catch((error: unknown) => {
        setState('idle');
        setFailure(errorText(error));
      });
  }

  // While the business is being removed its rows vanish under the page: say so, nothing else.
  if (state === 'clearing') {
    return (
      <>
        <PageHeader title={t.title} back={{ to: paths.more(), label: t.back }} />
        <p role="status" className="text-ink-muted">
          {t.removing}
        </p>
      </>
    );
  }
  if (result.status === 'error') {
    return <NotFoundPage />;
  }

  const loading = state === 'loading';
  const header = (
    <PageHeader
      title={t.title}
      back={{ to: paths.more(), label: t.back }}
      subtitle={
        status === undefined
          ? undefined
          : status.demo
            ? t.subtitle.demo(status.businessName)
            : status.empty
              ? t.subtitle.empty
              : t.subtitle.own
      }
      actions={
        status === undefined ? undefined : canLoad ? (
          <Button
            icon={ChefHat}
            onClick={() => {
              load();
            }}
            disabled={loading}
            aria-busy={loading}
          >
            {loading ? t.loading : t.load}
          </Button>
        ) : status.demo ? (
          <ButtonLink to={paths.cockpit()} icon={LayoutDashboard}>
            {t.toCockpit}
          </ButtonLink>
        ) : undefined
      }
    />
  );

  return (
    <>
      {header}
      {status === undefined ? null : (
        <div className="space-y-6">
          {failure === null ? null : <Notice tone="danger" title={failure} />}
          {loading ? <Progress /> : null}
          {status.demo ? <Loaded status={status} /> : <NotLoaded status={status} />}
          {status.demo ? (
            <Section title={t.removeTitle}>
              <Card>
                <p className="text-ink-muted">{t.removeText}</p>
                <div className="mt-4">
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setConfirming(true);
                    }}
                  >
                    {t.remove}
                  </Button>
                </div>
              </Card>
            </Section>
          ) : null}
        </div>
      )}
      <ConfirmDialog
        open={confirming}
        title={t.removeConfirmTitle}
        text={t.removeConfirmText}
        confirmLabel={t.removeConfirm}
        tone="danger"
        onConfirm={clear}
        onCancel={() => {
          setConfirming(false);
        }}
      />
    </>
  );
}

/** The demo builds in one go; the bar says that something happens, not how far it is. */
function Progress() {
  return (
    <Card>
      <div
        role="progressbar"
        aria-label={t.progressLabel}
        aria-valuetext={t.loading}
        className="h-2 overflow-hidden rounded-full bg-wine-100"
      >
        <div className="h-full w-full animate-pulse rounded-full bg-wine-700 motion-reduce:animate-none" />
      </div>
      <p role="status" className="mt-3 text-ink-muted">
        {t.progressText}
      </p>
    </Card>
  );
}

/** What the demo is, what it will hold, and either nothing to fear or why it cannot load here. */
function NotLoaded({ status }: { status: Status }) {
  const { contents } = status;
  const promise: [LucideIcon, string][] = [
    [MapPin, t.promise.areas(contents.areas, contents.spots)],
    [Package, t.promise.articles(contents.articles, contents.suppliers)],
    [Receipt, t.promise.market(contents.marketReceipts)],
    [BookOpen, t.promise.recipes(contents.dishes, contents.components)],
    [UtensilsCrossed, t.promise.menu(contents.menuCards)],
    [Soup, t.promise.lunch(contents.menuLines, contents.mealDays)],
    [ChartColumn, t.promise.history(contents.weeks)],
    [ThermometerSnowflake, t.promise.control],
    [Users, t.promise.team(contents.staff)],
  ];
  return (
    <>
      {status.empty ? null : (
        <Notice
          title={t.ownTitle}
          action={
            <ButtonLink to={paths.data()} variant="secondary" size="sm">
              {t.toData}
            </ButtonLink>
          }
        >
          {t.ownText}
        </Notice>
      )}
      <div className="space-y-6 lg:grid lg:grid-cols-3 lg:items-start lg:gap-6 lg:space-y-0">
        <div className="space-y-6 lg:col-span-2">
          <Card variant="premium">
            <h2 className="text-[1.25rem] font-semibold text-cork">{t.introTitle}</h2>
            <div className="mt-3 space-y-2 text-mist">
              {t.intro.map((sentence) => (
                <p key={sentence}>{sentence}</p>
              ))}
            </div>
          </Card>
          <Section title={t.promiseTitle} titleStyle="group">
            <GroupedList>
              {promise.map(([icon, text]) => (
                <ListRow key={text} icon={icon} title={text} />
              ))}
            </GroupedList>
          </Section>
        </div>
        <Card>
          <h2 className="font-semibold">{t.goodToKnowTitle}</h2>
          <ul className="mt-2 list-disc space-y-2 pl-5 text-ink-muted">
            {t.goodToKnow.map((sentence) => (
              <li key={sentence}>{sentence}</li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}

/** A loaded demo: the key figures, and a way into every area that holds its data. */
function Loaded({ status }: { status: Status }) {
  const { counts, contents } = status;
  const number = (value: number) => formatDecimal(value, { digits: 0 });
  const rows: { icon: LucideIcon; title: string; text: string; to: string }[] = [
    {
      icon: MapPin,
      title: t.rows.areas,
      text: t.rows.areasText(counts.areas, counts.spots),
      to: paths.areas(),
    },
    {
      icon: Package,
      title: t.rows.articles,
      text: t.rows.articlesText(counts.articles, counts.suppliers),
      to: paths.articles(),
    },
    {
      icon: Boxes,
      title: t.rows.stock,
      text: t.rows.stockText(counts.lots, counts.movements),
      to: paths.stock(),
    },
    {
      icon: BookOpen,
      title: t.rows.recipes,
      text: t.rows.recipesText(counts.dishes, counts.components),
      to: paths.recipes(),
    },
    {
      icon: CookingPot,
      title: t.rows.production,
      text: t.rows.productionText(counts.productions),
      to: paths.production(),
    },
    {
      icon: UtensilsCrossed,
      title: t.rows.menu,
      text: t.rows.menuText(counts.menuCards),
      to: paths.menu(),
    },
    {
      icon: CalendarDays,
      title: t.rows.plan,
      text: t.rows.planText(counts.planEntries),
      to: paths.plan(),
    },
    {
      icon: Soup,
      title: t.rows.meals,
      text: t.rows.mealsText(counts.menuLines, counts.mealCounts, counts.wasteWeighings),
      to: paths.plan(),
    },
    {
      icon: Truck,
      title: t.rows.purchasing,
      text: t.rows.purchasingText(
        counts.deliveries - counts.marketReceipts,
        counts.marketReceipts,
        counts.orders,
      ),
      to: paths.purchasing(),
    },
    {
      icon: ChartColumn,
      title: t.rows.numbers,
      text: t.rows.numbersText(counts.sales, counts.budgets),
      to: paths.numbers(),
    },
    {
      icon: ThermometerSnowflake,
      title: t.rows.haccp,
      text: t.rows.haccpText(counts.temperatureLogs, counts.hygieneChecks),
      to: paths.haccp(),
    },
    { icon: Users, title: t.rows.team, text: t.rows.teamText(counts.staff), to: paths.team() },
  ];
  return (
    <>
      <KpiGrid>
        <StatTile
          variant="premium"
          label={t.summary.history}
          value={t.summary.historyValue(contents.weeks)}
          {...(status.firstDay === undefined || status.lastDay === undefined
            ? {}
            : {
                hint: t.summary.historyHint(
                  formatSwissDate(status.firstDay),
                  formatSwissDate(status.lastDay),
                ),
              })}
        />
        <StatTile
          label={t.summary.articles}
          value={number(counts.articles)}
          hint={t.summary.articlesHint(counts.suppliers)}
          to={paths.articles()}
        />
        <StatTile
          label={t.summary.dishes}
          value={number(counts.dishes)}
          hint={t.summary.dishesHint(counts.components)}
          to={paths.recipes()}
        />
        <StatTile
          label={t.summary.movements}
          value={number(counts.movements)}
          hint={t.summary.movementsHint(counts.deliveries)}
          to={paths.journal()}
        />
      </KpiGrid>
      <div className="space-y-6 lg:grid lg:grid-cols-3 lg:items-start lg:gap-6 lg:space-y-0">
        <Section
          title={t.contentsTitle}
          titleStyle="group"
          hint={t.contentsHint}
          className="lg:col-span-2"
        >
          <GroupedList>
            {rows.map((row) => (
              <ListRow
                key={row.title}
                icon={row.icon}
                title={row.title}
                subtitle={row.text}
                to={row.to}
              />
            ))}
          </GroupedList>
        </Section>
        <Card variant="tip">
          <h2 className="font-semibold">{t.goodToKnowTitle}</h2>
          <div className="mt-2 space-y-2">
            {t.intro.slice(1).map((sentence) => (
              <p key={sentence}>{sentence}</p>
            ))}
          </div>
        </Card>
      </div>
    </>
  );
}
