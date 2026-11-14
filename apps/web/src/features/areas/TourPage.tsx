import {
  areaKindLabel,
  formatSwissDate,
  type OperationOutput,
  type TourArea,
  type TourSpot,
} from '@randen/core';
import { Camera, CircleCheck, Footprints, MapPin, Plus, Printer } from 'lucide-react';
import { useEffect, useId, useRef } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useBusiness, useQuery, useToday } from '../../app/hooks';
import { paths } from '../../app/paths';
import { AreaBadge, areaLooks } from '../../ui/badges';
import { Button, ButtonLink } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { ProgressBar } from '../../ui/charts';
import { DishPhoto } from '../../ui/DishPhoto';
import { EmptyState } from '../../ui/EmptyState';
import { FormActions } from '../../ui/FormActions';
import { PageHeader } from '../../ui/PageHeader';
import { ZoomablePhoto } from '../../ui/PhotoViewer';
import { areasMessages } from './messages';
import { areaLinks, rangeText } from './shared';

const t = areasMessages.tour;
const c = areasMessages.counts;

type Tour = OperationOutput<'tour.get'>;

/** One stop of the tour: a spot, or a whole area that has no spots yet. */
export type TourStop =
  { kind: 'spot'; area: TourArea; spot: TourSpot } | { kind: 'area'; area: TourArea };

/** Every spot in order; an area without spots is one stop of its own, so none is skipped. */
export function tourStops(areas: readonly TourArea[]): TourStop[] {
  return areas.flatMap((area): TourStop[] =>
    area.spots.length === 0
      ? [{ kind: 'area', area }]
      : area.spots.map((spot) => ({ kind: 'spot', area, spot })),
  );
}

const LINK =
  '-my-2 inline-flex min-h-11 items-center gap-1.5 rounded-lg font-semibold text-wine-800 hover:underline';

/** The names of what lies at a stop, and how many more there are. */
function Contents({ names, count }: { names: readonly string[]; count: number }) {
  if (count === 0) {
    return <p className="text-ink-muted">{t.nothingHere}</p>;
  }
  return (
    <>
      <ul className="flex flex-wrap gap-1.5">
        {names.map((name) => (
          <li
            key={name}
            className="rounded-full bg-surface-muted px-3 py-1 text-[0.9375rem] font-medium"
          >
            {name}
          </li>
        ))}
      </ul>
      {count > names.length ? (
        <p className="mt-2 text-[0.9375rem] text-ink-muted">{t.more(count - names.length)}</p>
      ) : null}
    </>
  );
}

/** The large picture of a stop, or a calm prompt with the way to take one. */
function StopPicture({ stop }: { stop: TourStop }) {
  const photo = stop.kind === 'spot' ? stop.spot.photo : stop.area.photo;
  const title = stop.kind === 'spot' ? `${stop.spot.name}, ${stop.area.name}` : stop.area.name;
  if (photo !== undefined) {
    return <ZoomablePhoto src={photo} title={title} className="aspect-4/3" />;
  }
  return (
    <div className="relative">
      <DishPhoto
        alt=""
        ratio="card"
        icon={stop.kind === 'spot' ? MapPin : areaLooks[stop.area.kind].icon}
      />
      <div className="absolute inset-x-0 bottom-4 flex flex-col items-center gap-2 px-4 text-center">
        <p className="font-semibold text-ink-muted">{t.photoMissing}</p>
        {stop.kind === 'spot' ? (
          <ButtonLink
            to={areaLinks.editSpot(stop.area.id, stop.spot.spotId)}
            variant="secondary"
            size="sm"
            icon={Camera}
          >
            {t.addPhoto}
            <span className="sr-only">, {stop.spot.name}</span>
          </ButtonLink>
        ) : null}
      </div>
    </div>
  );
}

/** One stop: the photo large, area and spot, the note and what lies there. */
function StopView({ stop }: { stop: TourStop }) {
  const heading = useRef<HTMLHeadingElement>(null);
  const headingId = useId();
  const range = rangeText(stop.area);
  const key = stop.kind === 'spot' ? stop.spot.spotId : stop.area.id;
  const first = useRef(true);
  // A new stop: the screen reader and the keyboard start at its name, not at the old button.
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    heading.current?.focus({ preventScroll: true });
    if (typeof heading.current?.scrollIntoView === 'function') {
      heading.current.scrollIntoView({ block: 'nearest' });
    }
  }, [key]);

  return (
    <article
      aria-labelledby={headingId}
      className="space-y-4 lg:grid lg:grid-cols-5 lg:items-start lg:gap-6 lg:space-y-0"
    >
      <div className="lg:col-span-3">
        <StopPicture stop={stop} />
      </div>
      <div className="space-y-4 lg:col-span-2">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <AreaBadge kind={stop.area.kind} name={stop.area.name} />
          {range === undefined ? null : (
            <span className="text-[0.9375rem] text-ink-muted tabular-nums">{range}</span>
          )}
        </p>
        <h2
          id={headingId}
          ref={heading}
          tabIndex={-1}
          className="text-[1.75rem] leading-tight font-bold break-words hyphens-calm outline-none"
        >
          {stop.kind === 'spot' ? stop.spot.name : t.wholeArea}
        </h2>
        {stop.kind === 'spot' && stop.spot.note !== undefined ? (
          <p className="text-lg whitespace-pre-line">{stop.spot.note}</p>
        ) : null}
        {stop.kind === 'area' ? (
          <p className="text-ink-muted">
            {t.noSpotsHint}{' '}
            <Link to={areaLinks.newSpot(stop.area.id)} className={LINK}>
              <Plus size={18} aria-hidden="true" />
              {t.addSpot}
            </Link>
          </p>
        ) : null}
        <div>
          <h3 className="mb-2 text-[0.8125rem] font-semibold tracking-wide text-ink-muted uppercase">
            {t.liesHere}
          </h3>
          {stop.kind === 'spot' ? (
            <Contents names={stop.spot.articleNames} count={stop.spot.articleCount} />
          ) : (
            <Contents names={stop.area.unplacedNames} count={stop.area.unplacedCount} />
          )}
        </div>
      </div>
    </article>
  );
}

/** The handout: every area and spot with a small photo, black on white. */
function PrintView({ tour }: { tour: Tour }) {
  const business = useBusiness();
  const today = useToday();
  const cell = 'border border-black px-2 py-1.5 text-left align-top';
  const names = (list: readonly string[], count: number) =>
    count === 0
      ? t.nothingHere
      : count > list.length
        ? `${list.join(', ')} ${t.more(count - list.length)}`
        : list.join(', ');
  return (
    <div className="hidden text-sm text-black print:block">
      <p className="text-2xl font-semibold">{t.title}</p>
      <p className="mb-4">{t.printMeta(business.name, formatSwissDate(today))}</p>
      {tour.areas.map((area) => {
        const range = rangeText(area);
        const rows = [
          ...area.spots.map((spot) => ({
            key: spot.spotId,
            photo: spot.photo,
            name: spot.name,
            note: spot.note,
            contents: names(spot.articleNames, spot.articleCount),
          })),
          ...(area.spots.length === 0 || area.unplacedCount > 0
            ? [
                {
                  key: `${area.id}-rest`,
                  photo: area.spots.length === 0 ? area.photo : undefined,
                  name: area.spots.length === 0 ? t.wholeArea : t.unplaced,
                  note: undefined,
                  contents: names(area.unplacedNames, area.unplacedCount),
                },
              ]
            : []),
        ];
        return (
          <table
            key={area.id}
            className="mb-6 w-full table-fixed border-collapse break-inside-avoid"
          >
            <caption className="mb-1 text-left text-base font-semibold">
              {[
                area.name,
                // «Kühlzelle · Kühlzelle» says nothing twice: the kind only where it adds to the name.
                area.name === areaKindLabel(area.kind) ? undefined : areaKindLabel(area.kind),
                range,
              ]
                .filter(Boolean)
                .join(' · ')}
            </caption>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key} className="break-inside-avoid">
                  <td className={`${cell} w-28`}>
                    {row.photo === undefined ? (
                      t.printPhotoMissing
                    ) : (
                      <DishPhoto
                        photo={row.photo}
                        alt=""
                        ratio="card"
                        radius="md"
                        className="w-24"
                      />
                    )}
                  </td>
                  <th scope="row" className={`${cell} w-[35%]`}>
                    <span className="block font-semibold">{row.name}</span>
                    {row.note === undefined ? null : (
                      <span className="block font-normal">{row.note}</span>
                    )}
                  </th>
                  <td className={cell}>{row.contents}</td>
                </tr>
              ))}
            </tbody>
          </table>
        );
      })}
    </div>
  );
}

/**
 * «Rundgang»: the first day of a new person, one spot at a time with its photo, «Weiter» and
 * «Zurück» in reach of the thumb. The stop lives in the address, so a reload keeps the place.
 * A print view lists every area and spot as a handout.
 */
export function TourPage() {
  const data = useQuery('tour.get', {});
  const [params, setParams] = useSearchParams();
  const stops = data === undefined ? [] : tourStops(data.areas);
  const asked = Number.parseInt(params.get('step') ?? '1', 10);
  // Past the last stop is the end of the tour.
  const step = Math.min(Math.max(Number.isNaN(asked) ? 1 : asked, 1), stops.length + 1);
  const stop = stops[step - 1];

  function go(next: number) {
    setParams({ step: String(next) }, { replace: true });
  }

  const header = (
    <PageHeader
      title={t.title}
      subtitle={
        data === undefined || stops.length === 0
          ? undefined
          : t.subtitle(c.spots(data.counts.spots), c.withPhoto(data.counts.spotsWithPhoto))
      }
      back={{ to: paths.areas(), label: t.back }}
      actions={
        data === undefined || stops.length === 0 ? undefined : (
          <Button
            variant="secondary"
            size="sm"
            icon={Printer}
            onClick={() => {
              window.print();
            }}
          >
            {t.print}
          </Button>
        )
      }
    />
  );

  return (
    <>
      <div className="print:hidden">
        {header}
        {data === undefined ? null : stops.length === 0 ? (
          <EmptyState
            icon={Footprints}
            title={t.emptyTitle}
            text={t.emptyText}
            action={<ButtonLink to={paths.areas()}>{t.toAreas}</ButtonLink>}
          />
        ) : stop === undefined ? (
          <Card>
            <div className="flex flex-col items-center py-6 text-center">
              <span className="flex size-14 items-center justify-center rounded-2xl bg-ok-bg text-ok">
                <CircleCheck size={28} strokeWidth={1.5} aria-hidden="true" />
              </span>
              <h2 className="mt-4 text-xl font-semibold">{t.doneTitle}</h2>
              <p className="mt-1 max-w-md text-ink-muted">
                {t.doneText(c.spots(data.counts.spots), c.areas(data.counts.areas))}
              </p>
              <div className="mt-5 flex flex-wrap justify-center gap-2">
                <Button
                  variant="secondary"
                  onClick={() => {
                    go(1);
                  }}
                >
                  {t.again}
                </Button>
                <ButtonLink to={paths.areas()}>{t.toAreas}</ButtonLink>
              </div>
            </div>
          </Card>
        ) : (
          <div className="space-y-5">
            <ProgressBar
              label={t.progress}
              value={step}
              max={stops.length}
              valueText={t.progressText(step, stops.length)}
              summary={t.progressSummary(step, stops.length)}
            />
            <StopView stop={stop} />
            <FormActions
              primaryLabel={step === stops.length ? t.finish : t.next}
              onPrimary={() => {
                go(step + 1);
              }}
              {...(step > 1
                ? {
                    secondaryLabel: t.back2,
                    onSecondary: () => {
                      go(step - 1);
                    },
                  }
                : {})}
            />
          </div>
        )}
      </div>
      {data === undefined || stops.length === 0 ? null : <PrintView tour={data} />}
    </>
  );
}
