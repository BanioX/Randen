import { allergenLabel, formatQuantity, formatSwissDate, type ProductionLabel } from '@randen/core';
import { productionMessages } from './messages';
import { Fact } from './shared';

const t = productionMessages;

/**
 * The label of a component: a small card that a label printer or a strip of paper takes
 * (`window.print`). On the screen it is a card; in print the page around it is left out.
 */
export function LabelCard({ label }: { label: ProductionLabel }) {
  const allergens = label.allergens.map(allergenLabel).join(', ');
  const traces = label.traces.map(allergenLabel).join(', ');
  return (
    <section
      aria-labelledby="label-title"
      className="mx-auto w-full max-w-sm rounded-2xl border border-line-strong bg-surface p-5 print:max-w-[80mm] print:rounded-none print:border-2 print:border-black print:bg-white print:p-3 print:text-black"
    >
      <h2 id="label-title" className="sr-only">
        {t.runPage.labelTitle}
      </h2>
      <p className="text-2xl leading-tight font-bold break-words print:text-xl">{label.name}</p>
      <dl className="mt-3 divide-y divide-line print:divide-black">
        <Fact label={t.label.producedOn}>{formatSwissDate(label.producedOn)}</Fact>
        {label.useBy === undefined || label.dateKind === undefined ? null : (
          <Fact label={t.dateKinds[label.dateKind]}>{formatSwissDate(label.useBy)}</Fact>
        )}
        {label.quantity === undefined || label.unit === undefined ? (
          <Fact label={t.label.quantity}>{t.label.portions(label.portions)}</Fact>
        ) : (
          <Fact label={t.label.quantity}>{formatQuantity(label.quantity, label.unit)}</Fact>
        )}
        <Fact label={t.label.diet}>{t.diets[label.diet]}</Fact>
        <Fact label={t.label.allergens}>{allergens === '' ? t.label.noAllergens : allergens}</Fact>
        {traces === '' ? null : <Fact label={t.label.traces}>{traces}</Fact>}
        {label.producedByName === undefined ? null : (
          <Fact label={t.label.producedBy}>{label.producedByName}</Fact>
        )}
      </dl>
      {label.incomplete ? (
        <p className="mt-3 text-[0.9375rem] font-semibold print:text-black">{t.label.incomplete}</p>
      ) : null}
      <p className="mt-4 font-mono text-lg tracking-wider print:text-base">
        {t.label.code} {label.code}
      </p>
    </section>
  );
}
