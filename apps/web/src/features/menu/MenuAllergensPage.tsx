import { dietLabel, IdSchema, type AllergenState, type Id } from '@randen/core';
import { ClipboardList, Printer } from 'lucide-react';
import { useParams } from 'react-router';
import { errorText, isNotFound, useQueryResult } from '../../app/hooks';
import { NotFoundPage } from '../../app/NotFoundPage';
import { paths } from '../../app/paths';
import { Button } from '../../ui/Button';
import { EmptyState } from '../../ui/EmptyState';
import { PageHeader } from '../../ui/PageHeader';
import { menuMessages } from './messages';
import { useLast } from './shared';

const t = menuMessages.allergens;
const NO_CARD = IdSchema.parse('00000000-0000-7000-8000-000000000000');

/** One cell: a filled dot with the word «enthält», an outline dot for traces, a dash for none. */
function Mark({ state, dish, allergen }: { state: AllergenState; dish: string; allergen: string }) {
  const label = `${dish}, ${allergen}: ${
    state === 'contains' ? t.contains : state === 'traces' ? t.traces : t.none
  }`;
  return (
    <span className="relative inline-flex size-11 items-center justify-center">
      {state === 'contains' ? (
        <span aria-hidden="true" className="size-4 rounded-full bg-wine-700" />
      ) : state === 'traces' ? (
        <span aria-hidden="true" className="size-4 rounded-full border-2 border-wine-700" />
      ) : (
        <span aria-hidden="true" className="text-ink-muted">
          –
        </span>
      )}
      <span className="sr-only">{label}</span>
    </span>
  );
}

/**
 * «Liste für das Personal»: the dishes of a card against the fourteen allergens, with the diet
 * and the origin. A real table; it prints on one landscape page.
 */
export function MenuAllergensPage() {
  const { cardId: cardParam = '' } = useParams();
  const parsed = IdSchema.safeParse(cardParam);
  const cardId: Id = parsed.success ? parsed.data : NO_CARD;
  const result = useQueryResult('menu.allergenSheet', { cardId }, { enabled: parsed.success });
  const data = useLast(result.data);

  if (!parsed.success || (result.status === 'error' && isNotFound(result.error))) {
    return <NotFoundPage />;
  }
  if (result.status === 'error') {
    throw result.error instanceof Error ? result.error : new Error(errorText(result.error));
  }
  if (data === undefined) {
    return <PageHeader title={t.title} back={{ to: paths.menu(), label: menuMessages.title }} />;
  }
  const { card, allergens, rows } = data;

  return (
    <>
      <PageHeader
        title={t.title}
        subtitle={`${card.name} · ${t.subtitle}`}
        back={{ to: paths.menuCard(card.id), label: card.name }}
        actions={
          <div className="print:hidden">
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
          </div>
        }
      />

      {rows.length === 0 ? (
        <EmptyState icon={ClipboardList} title={t.emptyTitle} text={t.empty} variant="card" />
      ) : (
        <div className="overflow-x-auto rounded-2xl bg-surface shadow-card print:overflow-visible print:rounded-none print:shadow-none">
          <table className="w-full min-w-[46rem] border-collapse text-[0.9375rem] print:min-w-0 print:text-[9pt]">
            <caption className="sr-only">{t.caption}</caption>
            <thead>
              <tr className="border-b border-line">
                <th
                  scope="col"
                  className="sticky left-0 z-10 bg-surface px-4 py-3 text-left font-semibold"
                >
                  {t.dish}
                </th>
                {allergens.map((allergen) => (
                  <th
                    key={allergen.id}
                    scope="col"
                    className="px-0.5 py-3 align-bottom font-semibold"
                    title={allergen.official}
                  >
                    <span className="block h-28 w-7 [writing-mode:vertical-rl] rotate-180 text-left text-[0.8125rem] leading-none whitespace-nowrap print:h-24 print:text-[8pt]">
                      {allergen.label}
                    </span>
                  </th>
                ))}
                <th scope="col" className="px-3 py-3 text-left font-semibold whitespace-nowrap">
                  {t.diet}
                </th>
                <th scope="col" className="px-3 py-3 text-left font-semibold">
                  {t.origin}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-line align-middle last:border-b-0">
                  <th
                    scope="row"
                    className="sticky left-0 z-10 bg-surface px-4 py-2 text-left font-semibold"
                  >
                    <span className="block">{row.name}</span>
                    <span className="block text-[0.8125rem] font-normal text-ink-muted">
                      {row.section}
                      {row.active ? '' : ` · ${t.inactive}`}
                      {row.incomplete ? ` · ${t.incomplete}` : ''}
                    </span>
                  </th>
                  {row.cells.map((cell) => {
                    const allergen = allergens.find((item) => item.id === cell.id);
                    return (
                      <td key={cell.id} className="p-0 text-center">
                        <Mark
                          state={cell.state}
                          dish={row.name}
                          allergen={allergen?.label ?? cell.id}
                        />
                      </td>
                    );
                  })}
                  <td className="px-3 py-2 whitespace-nowrap">
                    {row.diet === undefined ? t.dietMissing : dietLabel(row.diet)}
                  </td>
                  <td className="px-3 py-2">
                    {row.origins.length === 0
                      ? ''
                      : row.origins
                          .map((origin) =>
                            origin.countryName === undefined
                              ? t.originMissing
                              : `${origin.name}: ${origin.countryName}`,
                          )
                          .join(' · ')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ul className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-[0.875rem] text-ink-muted print:text-[8pt]">
        <li className="flex items-center gap-2">
          <span aria-hidden="true" className="size-3.5 rounded-full bg-wine-700" />
          {t.legendContains}
        </li>
        <li className="flex items-center gap-2">
          <span aria-hidden="true" className="size-3.5 rounded-full border-2 border-wine-700" />
          {t.legendTraces}
        </li>
        <li className="flex items-center gap-2">
          <span aria-hidden="true">–</span>
          {t.none}
        </li>
      </ul>
    </>
  );
}
