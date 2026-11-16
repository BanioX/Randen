import {
  allergenLabel,
  areaKindLabel,
  dietLabel,
  expiryInfo,
  formatPercent,
  formatTemperature,
  relativeDays,
  sortAllergens,
  type AllergenId,
  type AreaKind,
  type DateKind,
  type Diet,
  type LocalDate,
  type MarginStatus,
} from '@randen/core';
import {
  Box,
  ChefHat,
  CircleAlert,
  CircleCheck,
  Leaf,
  Package,
  Snowflake,
  Thermometer,
  TriangleAlert,
  Wine,
  type LucideIcon,
} from 'lucide-react';
import { displayMessages } from './messages.display';
import { StatusChip } from './StatusChip';
import type { Tone } from './tones';

const t = displayMessages;

interface ExpiryChipProps {
  expiresOn: LocalDate | undefined;
  dateKind: DateKind;
  /** The Swiss calendar day, from `useToday()`. */
  today: LocalDate;
  size?: 'md' | 'sm' | undefined;
}

/**
 * Where a lot stands against its date, as a kitchen says it: «in 12 Tagen», «morgen», «heute»,
 * «abgelaufen seit 3 Tagen» (Verbrauchsdatum over: must go), «MHD überschritten seit 3 Tagen»
 * (may still be good: the business decides). Without a date it shows nothing.
 */
export function ExpiryChip({ expiresOn, dateKind, today, size }: ExpiryChipProps) {
  const { status, daysLeft } = expiryInfo(expiresOn, dateKind, today);
  if (status === 'none' || daysLeft === undefined) {
    return null;
  }
  const when = relativeDays(daysLeft);
  if (status === 'expired') {
    return (
      <StatusChip tone="danger" icon={TriangleAlert} size={size}>
        {t.expiry.expired(when)}
      </StatusChip>
    );
  }
  if (status === 'past_best_before') {
    return (
      <StatusChip tone="soon" icon={CircleAlert} size={size}>
        {t.expiry.pastBestBefore(when)}
      </StatusChip>
    );
  }
  return (
    <StatusChip tone={status} size={size}>
      <span className="sr-only">{t.expiry.kind[dateKind]}: </span>
      {when}
    </StatusChip>
  );
}

interface AllergenBadgesProps {
  /** Allergens the dish contains. */
  allergens: readonly AllergenId[];
  /** Allergens it may contain traces of: outlined, with «Spuren:» in front. */
  traces?: readonly AllergenId[] | undefined;
  size?: 'md' | 'sm' | undefined;
  /** What to say when there is none, e.g. «Keine deklarationspflichtigen Allergene». */
  empty?: string | undefined;
}

/**
 * The allergens of a dish as small pills, in the order of the ordinance. Facts, not warnings:
 * neutral, the word is the message. Phrasing content, so it also fits into a row that is a link.
 */
export function AllergenBadges({
  allergens,
  traces = [],
  size = 'sm',
  empty,
}: AllergenBadgesProps) {
  const contains = sortAllergens(allergens);
  const mayContain = sortAllergens(traces).filter((id) => !contains.includes(id));
  if (contains.length === 0 && mayContain.length === 0) {
    return empty === undefined ? null : <span className="text-sm text-ink-muted">{empty}</span>;
  }
  const pill = `inline-flex items-center rounded-full leading-4 font-semibold ${
    size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-[0.8125rem]'
  }`;
  return (
    <span role="list" aria-label={t.allergens.label} className="inline-flex flex-wrap gap-1.5">
      {contains.map((id) => (
        <span key={id} role="listitem" className={`${pill} bg-surface-muted text-ink`}>
          {allergenLabel(id)}
        </span>
      ))}
      {mayContain.map((id) => (
        <span
          key={id}
          role="listitem"
          className={`${pill} border border-line-strong bg-surface text-ink-muted`}
        >
          {t.allergens.traces(allergenLabel(id))}
        </span>
      ))}
    </span>
  );
}

/** «Vegan» or «Vegetarisch» with a leaf; a dish with meat or fish shows nothing. */
export function DietBadge({ diet, size }: { diet: Diet; size?: 'md' | 'sm' | undefined }) {
  if (diet === 'omnivore') {
    return null;
  }
  return (
    <StatusChip tone="neutral" icon={Leaf} size={size}>
      {dietLabel(diet)}
    </StatusChip>
  );
}

/** The icon and the tone of each kind of storage area: the same in badges, tiles and lists. */
export const areaLooks: Record<AreaKind, { icon: LucideIcon; tone: Tone }> = {
  cold: { icon: Thermometer, tone: 'cold' },
  frozen: { icon: Snowflake, tone: 'frozen' },
  dry: { icon: Package, tone: 'dry' },
  bar: { icon: Wine, tone: 'bar' },
  station: { icon: ChefHat, tone: 'neutral' },
  other: { icon: Box, tone: 'neutral' },
};

interface AreaBadgeProps {
  kind: AreaKind;
  /** The name the business gave the area; without it the kind is named («Kühlzelle»). */
  name?: string | undefined;
  size?: 'md' | 'sm' | undefined;
}

/** Where something is kept: the area with the icon and the tone of its kind. */
export function AreaBadge({ kind, name, size }: AreaBadgeProps) {
  const { icon, tone } = areaLooks[kind];
  const label = areaKindLabel(kind);
  return (
    <StatusChip tone={tone} icon={icon} size={size}>
      {name === undefined || name === label ? (
        label
      ) : (
        <>
          <span className="sr-only">{label}: </span>
          {name}
        </>
      )}
    </StatusChip>
  );
}

const marginLooks: Record<
  Exclude<MarginStatus, 'unknown'>,
  { tone: Tone; icon: LucideIcon; words: string }
> = {
  good: { tone: 'ok', icon: CircleCheck, words: t.margin.status.good },
  watch: { tone: 'soon', icon: CircleAlert, words: t.margin.status.watch },
  over: { tone: 'danger', icon: TriangleAlert, words: t.margin.status.over },
};

interface MarginBadgeProps {
  /** From `dishFigures(…).status`. */
  status: MarginStatus;
  /** Share of goods in the net price, in basis points (3000 = 30 %). */
  foodCostBps?: number | undefined;
  /** Only «30 %», for a table column that is already headed «Wareneinsatz». */
  short?: boolean | undefined;
  size?: 'md' | 'sm' | undefined;
}

/**
 * How a dish stands against the target: «30 % Wareneinsatz» in green (im Ziel), amber (knapp
 * darüber) or vermilion (darüber), each with its own icon. Without a price or with missing costs
 * it says «Preis fehlt» instead of showing a pleasant number (ADR-0008).
 */
export function MarginBadge({ status, foodCostBps, short = false, size }: MarginBadgeProps) {
  if (status === 'unknown') {
    return (
      <StatusChip tone="neutral" size={size}>
        {t.margin.unknown}
      </StatusChip>
    );
  }
  const look = marginLooks[status];
  return (
    <StatusChip tone={look.tone} icon={look.icon} size={size}>
      {foodCostBps === undefined ? (
        look.words
      ) : (
        <>
          {short ? (
            <span className="whitespace-nowrap">{formatPercent(foodCostBps)}</span>
          ) : (
            t.margin.foodCost(formatPercent(foodCostBps))
          )}
          <span className="sr-only">, {look.words}</span>
        </>
      )}
    </StatusChip>
  );
}

interface TemperatureBadgeProps {
  /** Tenths of a degree Celsius: 45 = 4.5 °C. */
  deciC: number;
  /** Inside the range of the area? Without a judgement the badge stays neutral. */
  ok?: boolean | undefined;
  size?: 'md' | 'sm' | undefined;
}

/** A measured temperature: green with a thermometer inside the range, vermilion with a warning outside. */
export function TemperatureBadge({ deciC, ok, size }: TemperatureBadgeProps) {
  const text = formatTemperature(deciC);
  if (ok === undefined) {
    return (
      <StatusChip tone="neutral" icon={Thermometer} size={size}>
        {text}
      </StatusChip>
    );
  }
  return (
    <StatusChip tone={ok ? 'ok' : 'danger'} icon={ok ? Thermometer : TriangleAlert} size={size}>
      {text}
      <span className="sr-only">, {ok ? t.temperature.ok : t.temperature.off}</span>
    </StatusChip>
  );
}
