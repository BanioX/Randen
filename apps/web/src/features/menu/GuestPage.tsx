import {
  ALLERGEN_IDS,
  allergenLabel,
  IdSchema,
  menuFileName,
  type AllergenId,
  type Id,
} from '@randen/core';
import { LoaderCircle, Printer } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { errorText, isNotFound, useMoney, useQueryResult, useToday } from '../../app/hooks';
import { paths } from '../../app/paths';
import { AllergenPicker } from '../../ui/AllergenPicker';
import { fileMessages } from '../../ui/messages.files';
import { usePrintAction } from '../../ui/print';
import { PrintNoticeSheet } from '../../ui/PrintButton';
import { Sheet } from '../../ui/Sheet';
import { GuestDishRow } from './GuestDish';
import {
  DIET_FILTERS,
  filterDishes,
  readFilter,
  writeFilter,
  type DietFilter,
  type GuestFilter,
} from './guest-filter';
import { menuMessages } from './messages';

const t = menuMessages.guest;
const NO_CARD = IdSchema.parse('00000000-0000-7000-8000-000000000000');
const DIET_LABELS: Record<DietFilter, string> = {
  all: t.all,
  vegetarian: t.vegetarian,
  vegan: t.vegan,
};

/** A chip in the filter row: a pill of 44 px, `aria-pressed` for the choice. */
function FilterChip({
  pressed,
  onClick,
  children,
}: {
  pressed: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={`inline-flex min-h-11 shrink-0 items-center rounded-full border px-4 text-[0.9375rem] font-semibold transition-colors ${
        pressed
          ? 'border-wine-700 bg-wine-700 text-white'
          : 'border-line-strong bg-surface text-ink hover:bg-surface-muted'
      }`}
    >
      {children}
    </button>
  );
}

/**
 * The menu as a guest sees it: outside the app, full screen, on a tablet at the table, a phone
 * or a screen at the counter. A cover like a wine list, filters in their own row, the sections
 * and dishes; a quiet link back to Randen for the staff.
 */
export function GuestPage() {
  const { cardId: cardParam = '' } = useParams();
  const parsed = IdSchema.safeParse(cardParam);
  const cardId: Id = parsed.success ? parsed.data : NO_CARD;
  const [params, setParams] = useSearchParams();
  const preview = params.get('preview') === '1';
  const result = useQueryResult('menu.guest', { cardId, preview }, { enabled: parsed.success });
  const search = params.toString();
  const filter = useMemo(() => readFilter(new URLSearchParams(search)), [search]);
  const [allergenSheet, setAllergenSheet] = useState(false);
  const printed = useRef(false);
  const data = result.status === 'ready' ? result.data : undefined;
  const wantsPrint = params.get('drucken') === '1';
  const money = useMoney();
  const today = useToday();

  // The PDF of the card (ADR-0019), from the same query and filter as the page. Only the app
  // installed on an iPhone or iPad builds it; a browser prints the page itself.
  const buildPdf = useMemo(() => {
    if (data === undefined) {
      return undefined;
    }
    const input = {
      businessName: data.businessName,
      card: data.card,
      groups: data.sections
        .map((section) => ({ section, entries: filterDishes(section.dishes, filter) }))
        .filter((group) => group.entries.length > 0),
      hasSections: data.sections.length > 0,
      money,
      printedOn: today,
    };
    return () => import('./guest-pdf').then((pdf) => pdf.buildGuestPdf(input));
  }, [data, filter, money, today]);
  const printing = usePrintAction({
    buildPdf,
    fileName: menuFileName(data?.card.name ?? '', 'pdf'),
    title: data?.card.name,
  });
  const { printFromAddress } = printing;

  useEffect(() => {
    if (wantsPrint && data !== undefined && !printed.current) {
      printed.current = true;
      printFromAddress();
    }
  }, [wantsPrint, data, printFromAddress]);

  function change(next: GuestFilter) {
    setParams(writeFilter(params, next), { replace: true });
  }

  const shell = (children: ReactNode) => (
    <div className="min-h-dvh bg-ground text-ink print:bg-white print:text-black">{children}</div>
  );

  if (!parsed.success || (result.status === 'error' && isNotFound(result.error))) {
    return shell(
      <main className="mx-auto max-w-xl space-y-3 px-5 py-16">
        <h1 className="text-[1.75rem] font-semibold">{t.notFoundTitle}</h1>
        <p className="text-ink-muted">{t.notFoundText}</p>
        <Link
          to={paths.cockpit()}
          className="inline-flex min-h-11 items-center font-semibold text-wine-800 underline-offset-2 hover:underline"
        >
          {t.back}
        </Link>
      </main>,
    );
  }
  if (result.status === 'error') {
    throw result.error instanceof Error ? result.error : new Error(errorText(result.error));
  }
  if (data === undefined) {
    return shell(<div className="bg-grape px-5 py-10 text-white" aria-busy="true" />);
  }

  const { card, businessName, sections, allergens, traces, diets } = data;
  const onCard: readonly AllergenId[] = [...allergens, ...traces];
  const excludedNames = filter.without.map((id) => allergenLabel(id));
  const notOnCard = ALLERGEN_IDS.filter((id) => !onCard.includes(id));
  const visible = sections
    .map((section) => ({ section, entries: filterDishes(section.dishes, filter) }))
    .filter((group) => group.entries.length > 0);
  const hasDiet = (value: DietFilter) =>
    value === 'all' ||
    diets.some((diet) => (value === 'vegan' ? diet === 'vegan' : diet !== 'omnivore'));
  const printButton = (
    <button
      type="button"
      onClick={printing.print}
      aria-busy={printing.busy ? 'true' : undefined}
      aria-disabled={printing.busy ? 'true' : undefined}
      className={`inline-flex min-h-11 items-center gap-2 rounded-xl border border-line-strong bg-surface px-4 font-semibold ${
        printing.busy ? 'cursor-progress' : ''
      }`}
    >
      {printing.busy ? (
        <LoaderCircle
          size={18}
          aria-hidden="true"
          className="animate-spin motion-reduce:animate-none"
        />
      ) : (
        <Printer size={18} aria-hidden="true" />
      )}
      {t.print}
    </button>
  );

  return shell(
    <>
      <header className="bg-grape px-5 pt-10 pb-8 text-white md:px-10 print:bg-white print:px-0 print:pt-0 print:pb-4 print:text-black">
        <div className="mx-auto max-w-2xl">
          <p className="text-[0.8125rem] font-semibold tracking-[0.08em] text-cork uppercase print:text-black">
            {t.kicker}
          </p>
          <h1 className="mt-1.5 text-[2.125rem] leading-tight font-bold break-words">
            {businessName}
          </h1>
          <p className="mt-1 text-[1.125rem] text-cork print:text-black">{card.name}</p>
          {card.intro === undefined ? null : (
            <p className="mt-4 max-w-prose whitespace-pre-line text-[#EDE3D6] print:text-black">
              {card.intro}
            </p>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-2xl space-y-6 px-5 py-6 md:px-10 print:max-w-none print:space-y-4 print:px-0 print:py-2">
        {preview ? (
          <p role="status" className="rounded-2xl bg-surface px-4 py-3 text-ink-muted print:hidden">
            {t.previewNotice}
          </p>
        ) : null}

        {wantsPrint && printing.mode === 'share' ? (
          // The installed iOS app cannot print by itself: the share sheet needs a tap.
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-surface px-4 py-3 print:hidden">
            <p role="status" className="min-w-0 flex-1 text-ink">
              {fileMessages.print.fromAddress}
            </p>
            {printButton}
          </div>
        ) : null}

        {allergens.length + traces.length + diets.length === 0 ? null : (
          <div
            role="group"
            aria-label={t.filterLabel}
            className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1 print:hidden md:mx-0 md:flex-wrap md:overflow-visible md:px-0"
          >
            {DIET_FILTERS.filter(hasDiet).map((value) => (
              <FilterChip
                key={value}
                pressed={filter.diet === value}
                onClick={() => {
                  change({ ...filter, diet: value });
                }}
              >
                {DIET_LABELS[value]}
              </FilterChip>
            ))}
            {onCard.length === 0 ? null : (
              <FilterChip
                pressed={filter.without.length > 0}
                onClick={() => {
                  setAllergenSheet(true);
                }}
              >
                {filter.without.length === 0 ? t.without : t.withoutSome(excludedNames.join(', '))}
              </FilterChip>
            )}
          </div>
        )}

        {visible.length === 0 ? (
          // Nothing to filter out when the card has no dishes; the filter sentence is for a filter.
          <p className="text-ink-muted">{sections.length === 0 ? t.emptyCard : t.noneLeft}</p>
        ) : (
          visible.map(({ section, entries }) => (
            <section
              key={section.id}
              aria-labelledby={`section-${section.id}`}
              className="space-y-2"
            >
              <h2
                id={`section-${section.id}`}
                className="text-[0.8125rem] font-semibold tracking-[0.08em] text-wine-800 uppercase print:text-black"
              >
                {section.title}
              </h2>
              <ul className="rounded-2xl bg-surface px-4 shadow-card md:px-5 print:rounded-none print:bg-white print:px-0 print:shadow-none">
                {entries.map((entry) => (
                  <GuestDishRow key={entry.dish.id} entry={entry} />
                ))}
              </ul>
            </section>
          ))
        )}

        <Sheet
          open={allergenSheet}
          onClose={() => {
            setAllergenSheet(false);
          }}
          title={t.sheetTitle}
          footer={
            <button
              type="button"
              onClick={() => {
                setAllergenSheet(false);
              }}
              className="inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-wine-700 font-semibold text-white"
            >
              {t.done}
            </button>
          }
        >
          <div className="space-y-4">
            <p className="text-ink-muted">{t.sheetText}</p>
            <AllergenPicker
              legend={t.allergenPicker}
              hint={t.allergenHint}
              value={filter.without}
              onChange={(without: AllergenId[]) => {
                change({ ...filter, without });
              }}
              unavailable={notOnCard}
            />
            {filter.without.length === 0 ? null : (
              <button
                type="button"
                onClick={() => {
                  change({ ...filter, without: [] });
                }}
                className="min-h-11 font-semibold text-wine-800 underline-offset-2 hover:underline"
              >
                {t.clear}
              </button>
            )}
          </div>
        </Sheet>
      </main>

      <footer className="mx-auto max-w-2xl space-y-4 border-t border-line px-5 pt-5 pb-10 md:px-10 print:max-w-none print:px-0 print:pt-3">
        {card.footer === undefined ? null : (
          <p className="whitespace-pre-line text-ink-muted print:text-black">{card.footer}</p>
        )}
        <p className="text-[0.9375rem] text-ink-muted print:text-black">{t.notice}</p>
        <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
          <Link
            to={paths.cockpit()}
            className="inline-flex min-h-11 items-center font-semibold text-wine-800 underline-offset-2 hover:underline"
          >
            {t.back}
          </Link>
          {printButton}
        </div>
        <PrintNoticeSheet action={printing} />
      </footer>
    </>,
  );
}
