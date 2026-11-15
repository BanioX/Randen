import { BUSINESS_KINDS, businessKindLabel, VAT_RATES_CH, type BusinessKind } from '@randen/core';
import { Settings2 } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { messages } from '../../app/messages';
import { errorText, useBusiness, useCommand, useMoney } from '../../app/hooks';
import { paths } from '../../app/paths';
import { FormActions } from '../../ui/FormActions';
import { GroupedList, ListRow } from '../../ui/GroupedList';
import { Notice } from '../../ui/Notice';
import { PageHeader } from '../../ui/PageHeader';
import { PercentField } from '../../ui/PercentField';
import { Section } from '../../ui/Section';
import { SelectField } from '../../ui/SelectField';
import { TextField } from '../../ui/TextField';
import { useToast } from '../../ui/Toast';
import { settingsMessages } from './messages';

const t = settingsMessages.business;

/** The VAT choices of a new recipe: the rates of the ordinance, and one of our own. */
type VatChoice = (typeof VAT_RATES_CH)[number]['id'] | 'other';

const KIND_OPTIONS = BUSINESS_KINDS.map((kind) => ({
  value: kind,
  label: businessKindLabel(kind),
}));
const VAT_OPTIONS = [
  ...VAT_RATES_CH.map((rate) => ({ value: rate.id, label: rate.label })),
  { value: 'other' as VatChoice, label: t.vatOther },
];

/** The rate a business has, as a choice: one of the ordinance's rates, or «Anderer Satz». */
function vatChoiceOf(bps: number): VatChoice {
  return VAT_RATES_CH.find((rate) => rate.bps === bps)?.id ?? 'other';
}

/**
 * «Betrieb» (H3): name, kind, the target of the cost of goods and the VAT a new recipe gets. The
 * currency only shows, it is fixed on the business (ADR-0004). The business is saved as a whole
 * with the fields that changed.
 */
export function BusinessPage() {
  const business = useBusiness();
  const money = useMoney();
  const run = useCommand();
  const toast = useToast();
  const navigate = useNavigate();
  const [name, setName] = useState(business.name);
  const [kind, setKind] = useState<BusinessKind>(business.kind);
  const [target, setTarget] = useState<number | null>(business.targetFoodCostBps);
  const [vat, setVat] = useState<VatChoice>(vatChoiceOf(business.defaultVatBps));
  const [vatOther, setVatOther] = useState<number | null>(
    vatChoiceOf(business.defaultVatBps) === 'other' ? business.defaultVatBps : null,
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const vatBps =
    vat === 'other' ? vatOther : (VAT_RATES_CH.find((rate) => rate.id === vat)?.bps ?? null);

  async function save() {
    // The form guard has checked the fields already; these are the types and nothing more.
    if (target === null || vatBps === null) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await run('business.update', {
        name: name.trim(),
        kind,
        targetFoodCostBps: target,
        defaultVatBps: vatBps,
      });
      toast({ text: t.saved });
      void navigate(paths.more());
    } catch (failure) {
      setBusy(false);
      setError(errorText(failure));
    }
  }

  return (
    <form
      className="max-w-2xl space-y-8"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <PageHeader
        title={t.title}
        back={{ to: paths.more(), label: settingsMessages.more.title }}
        subtitle={t.intro}
      />

      <Section title={t.sectionBasics} titleStyle="group">
        <div className="space-y-5">
          <TextField
            label={t.name}
            value={name}
            onChange={setName}
            required
            maxLength={80}
            autoComplete="organization"
          />
          <SelectField
            label={t.kind}
            hint={t.kindHint}
            options={KIND_OPTIONS}
            value={kind}
            onChange={(value) => {
              if (value !== null) {
                setKind(value);
              }
            }}
            required
          />
        </div>
      </Section>

      <Section title={t.sectionNumbers} titleStyle="group">
        <div className="space-y-5">
          <PercentField
            label={t.target}
            hint={t.targetHint}
            value={target}
            onChange={setTarget}
            min={500}
            max={9000}
            required
          />
          <SelectField
            label={t.vat}
            hint={t.vatHint}
            options={VAT_OPTIONS}
            value={vat}
            onChange={(value) => {
              if (value !== null) {
                setVat(value);
              }
            }}
            required
          />
          {vat === 'other' ? (
            <PercentField
              label={t.vatOtherField}
              value={vatOther}
              onChange={setVatOther}
              min={0}
              max={3000}
              required
            />
          ) : null}
        </div>
      </Section>

      <Section title={t.sectionCurrency} titleStyle="group">
        <GroupedList>
          <li className="px-4 py-3 text-ink">{t.currencyText(money.currency)}</li>
        </GroupedList>
      </Section>

      <Section title={t.sectionSetup} titleStyle="group">
        <GroupedList>
          <ListRow title={t.setupLink} subtitle={t.setupHint} icon={Settings2} to={paths.setup()} />
        </GroupedList>
      </Section>

      {error === null ? null : <Notice tone="danger">{error}</Notice>}
      <FormActions
        primaryLabel={messages.actions.save}
        primaryDisabled={busy}
        secondaryLabel={messages.actions.cancel}
        onSecondary={() => {
          void navigate(paths.more());
        }}
        placement="inline"
      />
    </form>
  );
}
