import {
  CommandError,
  SupplierSchema,
  WEEKDAYS,
  type Id,
  type OperationOutput,
  type Rappen,
  type Weekday,
} from '@randen/core';
import { useState, type SyntheticEvent, type ReactNode } from 'react';
import { errorText, useCommand } from '../../app/hooks';
import { Card } from '../../ui/Card';
import { MultiChoiceChips } from '../../ui/ChoiceChips';
import { FormActions } from '../../ui/FormActions';
import { MoneyField } from '../../ui/MoneyField';
import { Section } from '../../ui/Section';
import { TextArea, TextField } from '../../ui/TextField';
import { articlesMessages } from './messages';

const t = articlesMessages.suppliers.form;

type SupplierFacts = OperationOutput<'suppliers.get'>['supplier'];

interface Draft {
  name: string;
  customerNumber: string;
  phone: string;
  email: string;
  orderDays: Weekday[];
  deliveryDays: Weekday[];
  minOrderRappen: Rappen | null;
  note: string;
}

const EMPTY: Draft = {
  name: '',
  customerNumber: '',
  phone: '',
  email: '',
  orderDays: [],
  deliveryDays: [],
  minOrderRappen: null,
  note: '',
};

const DAY_OPTIONS = WEEKDAYS.map((day) => ({
  value: day,
  label: articlesMessages.suppliers.weekdays[day],
  description: articlesMessages.suppliers.weekdayNames[day],
}));

const textOrNull = (text: string) => (text.trim() === '' ? null : text.trim());

interface SupplierFormProps {
  /** The supplier to change; without it the form creates one. */
  supplier?: SupplierFacts | undefined;
  /** `page` on a page of its own, `inline` inside a sheet. */
  placement: 'page' | 'inline';
  onSaved: (supplierId: Id) => void;
  onCancel: () => void;
}

/** The fields of a supplier, for «Lieferant erfassen» and for editing in a sheet. */
export function SupplierForm({ supplier, placement, onSaved, onCancel }: SupplierFormProps) {
  const run = useCommand();
  const [draft, setDraft] = useState<Draft>(() =>
    supplier === undefined
      ? EMPTY
      : {
          name: supplier.name,
          customerNumber: supplier.customerNumber ?? '',
          phone: supplier.phone ?? '',
          email: supplier.email ?? '',
          orderDays: supplier.orderDays,
          deliveryDays: supplier.deliveryDays,
          minOrderRappen: supplier.minOrderRappen ?? null,
          note: supplier.note ?? '',
        },
  );
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<unknown>(null);
  const [submitted, setSubmitted] = useState(false);

  const change = (fields: Partial<Draft>) => {
    setDraft((current) => ({ ...current, ...fields }));
  };

  const email = draft.email.trim();
  const emailError =
    email !== '' && !SupplierSchema.shape.email.safeParse(email).success ? t.emailInvalid : null;
  const duplicate = failure instanceof CommandError && failure.code === 'duplicate_name';

  async function save(): Promise<Id> {
    const optional = {
      customerNumber: textOrNull(draft.customerNumber),
      phone: textOrNull(draft.phone),
      email: email === '' ? null : email,
      minOrderRappen: draft.minOrderRappen,
      note: textOrNull(draft.note),
    };
    const days = { orderDays: draft.orderDays, deliveryDays: draft.deliveryDays };
    if (supplier !== undefined) {
      await run('suppliers.update', {
        supplierId: supplier.id,
        name: draft.name,
        ...days,
        ...optional,
      });
      return supplier.id;
    }
    const created = await run('suppliers.create', {
      name: draft.name,
      ...days,
      ...(optional.customerNumber === null ? {} : { customerNumber: optional.customerNumber }),
      ...(optional.phone === null ? {} : { phone: optional.phone }),
      ...(optional.email === null ? {} : { email: optional.email }),
      ...(optional.minOrderRappen === null ? {} : { minOrderRappen: optional.minOrderRappen }),
      ...(optional.note === null ? {} : { note: optional.note }),
    });
    return created.supplierId;
  }

  function onSubmit(event: SyntheticEvent) {
    event.preventDefault();
    // A sheet lies inside the page: its form must not send a form around it.
    event.stopPropagation();
    setSubmitted(true);
    if (saving || emailError !== null) {
      return;
    }
    setSaving(true);
    setFailure(null);
    save()
      .then(onSaved)
      .catch((error: unknown) => {
        setFailure(error);
      })
      .finally(() => {
        setSaving(false);
      });
  }

  const onPage = placement === 'page';
  /** On a page each block is a card; a sheet is one surface already. */
  const block = (className: string, children: ReactNode) =>
    onPage ? (
      <Card className={className}>{children}</Card>
    ) : (
      <div className={className}>{children}</div>
    );
  const level = onPage ? 2 : 3;

  return (
    <form onSubmit={onSubmit} className={onPage ? 'max-w-2xl space-y-8' : 'space-y-6'}>
      <Section title={t.sections.supplier} level={level}>
        {block(
          'grid gap-5 sm:grid-cols-2',
          <>
            <TextField
              label={t.name}
              required
              maxLength={80}
              value={draft.name}
              onChange={(name) => {
                change({ name });
                setFailure(null);
              }}
              error={duplicate ? t.duplicate : null}
              className="sm:col-span-2"
            />
            <TextField
              label={t.phone}
              optional
              type="tel"
              autoComplete="off"
              maxLength={40}
              value={draft.phone}
              onChange={(phone) => {
                change({ phone });
              }}
            />
            <TextField
              label={t.email}
              optional
              // A text field with the e-mail keyboard: the form checks the address itself and
              // says what is wrong, where the browser's own check would only stop the form.
              inputMode="email"
              maxLength={120}
              value={draft.email}
              onChange={(next) => {
                change({ email: next });
              }}
              error={submitted ? emailError : null}
            />
          </>,
        )}
      </Section>

      <Section title={t.sections.days} level={level}>
        {block(
          'space-y-5',
          <>
            <MultiChoiceChips
              legend={t.orderDays}
              hint={t.orderDaysHint}
              options={DAY_OPTIONS}
              value={draft.orderDays}
              onChange={(orderDays) => {
                change({ orderDays });
              }}
            />
            <MultiChoiceChips
              legend={t.deliveryDays}
              options={DAY_OPTIONS}
              value={draft.deliveryDays}
              onChange={(deliveryDays) => {
                change({ deliveryDays });
              }}
            />
            <MoneyField
              label={t.minOrder}
              optional
              value={draft.minOrderRappen}
              onChange={(minOrderRappen) => {
                change({ minOrderRappen });
              }}
              className="sm:max-w-xs"
            />
          </>,
        )}
      </Section>

      <Section title={t.sections.more} level={level}>
        {block(
          'grid gap-5 sm:grid-cols-2',
          <>
            <TextField
              label={t.customerNumber}
              optional
              maxLength={40}
              value={draft.customerNumber}
              onChange={(customerNumber) => {
                change({ customerNumber });
              }}
            />
            <TextArea
              label={t.note}
              optional
              maxLength={500}
              placeholder={t.notePlaceholder}
              value={draft.note}
              onChange={(note) => {
                change({ note });
              }}
              className="sm:col-span-2"
            />
          </>,
        )}
      </Section>

      <FormActions
        placement={placement}
        primaryLabel={t.save}
        primaryDisabled={saving}
        secondaryLabel={t.cancel}
        onSecondary={onCancel}
        error={failure === null ? null : errorText(failure)}
      />
    </form>
  );
}
