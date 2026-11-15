import { dietLabel, type AllergenRef, type GuestDish } from '@randen/core';
import { useState } from 'react';
import { useMoney } from '../../app/hooks';
import { DishPhoto } from '../../ui/DishPhoto';
import { Sheet } from '../../ui/Sheet';
import { ZoomablePhoto } from '../../ui/PhotoViewer';
import { menuMessages } from './messages';
import type { FilteredDish } from './guest-filter';

const t = menuMessages.guest;

/** A small pill with a word: an allergen, a trace, a diet, a label. */
export function Pill({ children, trace = false }: { children: string; trace?: boolean }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[0.8125rem] leading-5 ${
        trace
          ? 'border-dashed border-line-strong text-ink-muted'
          : 'border-line bg-surface text-ink'
      }`}
    >
      {children}
    </span>
  );
}

/** The origin line of a dish: «Rindsentrecôte: Schweiz», or that it is still missing. */
export function originWords(dish: GuestDish): string[] {
  return dish.origins.map((origin) =>
    origin.countryName === undefined
      ? t.originMissing(origin.name)
      : t.origin(origin.name, origin.countryName),
  );
}

function priceText(dish: GuestDish, money: ReturnType<typeof useMoney>): string | undefined {
  return dish.priceRappen === undefined ? undefined : money.format(dish.priceRappen);
}

/**
 * A dish on the card: photo, name, description, price right-aligned, allergen pills, diet,
 * labels and the origin. A tap opens the dish with its large photo and the official names.
 */
export function GuestDishRow({ entry }: { entry: FilteredDish }) {
  const { dish, traceHits } = entry;
  const money = useMoney();
  const [open, setOpen] = useState(false);
  const price = priceText(dish, money);
  return (
    <li className="border-b border-line last:border-b-0">
      <button
        type="button"
        aria-haspopup="dialog"
        onClick={() => {
          setOpen(true);
        }}
        className="flex min-h-11 w-full gap-4 rounded-2xl py-4 text-left transition-colors hover:bg-surface-muted/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-wine-600"
      >
        {dish.photo === undefined ? null : (
          <DishPhoto
            photo={dish.photo}
            alt=""
            ratio="square"
            radius="lg"
            className="size-16 shrink-0 md:size-20 print:hidden"
          />
        )}
        <span className="min-w-0 flex-1">
          <span className="flex items-start justify-between gap-3">
            <span className="min-w-0 text-[1.0625rem] leading-snug font-semibold break-words hyphens-calm">
              {dish.name}
            </span>
            {price === undefined ? null : (
              <span className="shrink-0 font-semibold tabular-nums">{price}</span>
            )}
          </span>
          {dish.description === undefined ? null : (
            <span className="mt-1 block text-[0.9375rem] text-ink-muted">{dish.description}</span>
          )}
          <span className="mt-2 flex flex-wrap gap-1.5">
            {dish.allergens.map((item) => (
              <Pill key={item.id}>{item.label}</Pill>
            ))}
            {dish.traces.map((item) => (
              <Pill key={`trace-${item.id}`} trace>{`${t.traces}: ${item.label}`}</Pill>
            ))}
            {dish.diet === 'omnivore' ? null : <Pill>{dietLabel(dish.diet)}</Pill>}
            {dish.labels.map((label) => (
              <Pill key={label.id}>{label.text}</Pill>
            ))}
          </span>
          {traceHits.length === 0 ? null : (
            <span className="mt-2 block text-[0.875rem] text-ink-muted">
              {t.traceMark(traceHits.map((item) => item.label).join(', '))}
            </span>
          )}
          {originWords(dish).map((line) => (
            <span key={line} className="mt-1.5 block text-[0.875rem] text-ink-muted">
              {line}
            </span>
          ))}
          {dish.incomplete ? (
            <span className="mt-1.5 block text-[0.875rem] font-semibold text-danger">
              {t.incomplete}
            </span>
          ) : null}
        </span>
      </button>
      <DishSheet
        dish={dish}
        open={open}
        onClose={() => {
          setOpen(false);
        }}
      />
    </li>
  );
}

function AllergenList({ title, items }: { title: string; items: readonly AllergenRef[] }) {
  if (items.length === 0) {
    return null;
  }
  return (
    <div className="space-y-1">
      <h3 className="text-[0.8125rem] font-semibold tracking-[0.06em] text-ink-muted uppercase">
        {title}
      </h3>
      <dl className="space-y-2">
        {items.map((item) => (
          <div key={item.id}>
            <dt className="font-semibold">{item.label}</dt>
            <dd className="text-[0.9375rem] text-ink-muted">{item.official}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** The dish in full: the large photo, the price and the official names of the allergens. */
export function DishSheet({
  dish,
  open,
  onClose,
}: {
  dish: GuestDish;
  open: boolean;
  onClose: () => void;
}) {
  const money = useMoney();
  const price = priceText(dish, money);
  return (
    <Sheet open={open} onClose={onClose} title={dish.name}>
      <div className="space-y-5">
        {dish.photo === undefined ? null : (
          <ZoomablePhoto
            src={dish.photo}
            title={t.photoOf(dish.name)}
            className="aspect-video w-full rounded-2xl"
          />
        )}
        <p className="flex flex-wrap items-baseline justify-between gap-3">
          {price === undefined ? null : <span className="font-semibold tabular-nums">{price}</span>}
        </p>
        {dish.description === undefined ? null : <p>{dish.description}</p>}
        <div className="flex flex-wrap gap-1.5">
          {dish.diet === 'omnivore' ? null : <Pill>{dietLabel(dish.diet)}</Pill>}
          {dish.labels.map((label) => (
            <Pill key={label.id}>{label.text}</Pill>
          ))}
        </div>
        <AllergenList title={t.allergens} items={dish.allergens} />
        <AllergenList title={t.traces} items={dish.traces} />
        {originWords(dish).map((line) => (
          <p key={line} className="text-ink-muted">
            {line}
          </p>
        ))}
        {dish.incomplete ? <p className="font-semibold text-danger">{t.incomplete}</p> : null}
      </div>
    </Sheet>
  );
}
