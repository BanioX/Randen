import { formatQuantity, type ArticleLot, type Id, type Unit } from '@randen/core';
import { useRef, useState, type ReactNode } from 'react';
import { errorText, useCommand, useMoney, useQuery } from '../../app/hooks';
import { ChoiceChips } from '../../ui/ChoiceChips';
import { FormActions } from '../../ui/FormActions';
import { AreaPicker } from '../../ui/pickers';
import { QuantityField } from '../../ui/QuantityField';
import { Sheet } from '../../ui/Sheet';
import { TextArea } from '../../ui/TextField';
import { useEnterKeyHint } from './hooks';
import { dateText } from './labels';
import { partValue } from './math';
import { stockMessages } from './messages';
import { WriteOffFields, writeOffReady, type WriteOffDraft } from './WriteOffFields';

const t = stockMessages.sheets;

export type LotAction = 'withdraw' | 'writeOff' | 'move';

interface LotFormProps {
  article: { id: Id; name: string; unit: Unit };
  lot: ArticleLot;
  onClose: () => void;
  /** After booking: the page closes the sheet and shows this line as a toast. */
  onDone: (text: string) => void;
}

interface LotSheetProps extends Omit<LotFormProps, 'lot'> {
  /** What is done to the lot; null keeps the sheet closed. */
  action: LotAction | null;
  lot: ArticleLot | undefined;
}

const TITLES: Record<LotAction, string> = {
  withdraw: t.withdraw.title,
  writeOff: t.writeOff.title,
  move: t.move.title,
};

/**
 * The sheet for the three things one does with a lot: take from it, write it off, move it.
 * It stays in the page and only opens and closes; its form is new each time it opens, so
 * nothing typed before is left in it.
 */
export function LotSheet({ action, lot, ...rest }: LotSheetProps) {
  const open = action !== null && lot !== undefined;
  return (
    <Sheet open={open} onClose={rest.onClose} title={action === null ? '' : TITLES[action]}>
      {!open ? null : action === 'withdraw' ? (
        <WithdrawForm lot={lot} {...rest} />
      ) : action === 'writeOff' ? (
        <WriteOffForm lot={lot} {...rest} />
      ) : (
        <MoveForm lot={lot} {...rest} />
      )}
    </Sheet>
  );
}

/** The frame the three forms share: which lot, the fields, one main button, the error. */
function LotForm({
  article,
  lot,
  onClose,
  onSubmit,
  summary,
  action,
  error,
  busy,
  children,
}: {
  article: LotFormProps['article'];
  lot: ArticleLot;
  onClose: () => void;
  onSubmit: () => void;
  summary: string | undefined;
  action: string;
  error: string | null;
  busy: boolean;
  children: ReactNode;
}) {
  const form = useRef<HTMLFormElement>(null);
  useEnterKeyHint(form, 'done');
  return (
    <form
      ref={form}
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
      className="space-y-4"
    >
      <p className="text-ink-muted">
        {article.name} · {dateText(lot.expiresOn, lot.dateKind)} ·{' '}
        {formatQuantity(lot.quantity, article.unit)} · {lot.area.name}
      </p>
      {children}
      <FormActions
        placement="inline"
        primaryLabel={action}
        primaryBusy={busy}
        secondaryLabel={t.cancel}
        onSecondary={onClose}
        summary={summary}
        error={error}
      />
    </form>
  );
}

const note = (text: string) => (text.trim() === '' ? {} : { note: text.trim() });

/** Takes goods from one lot by hand: for the kitchen, or for the staff. */
function WithdrawForm({ article, lot, onClose, onDone }: LotFormProps) {
  const run = useCommand();
  const money = useMoney();
  const [quantity, setQuantity] = useState<number | null>(lot.quantity);
  const [purpose, setPurpose] = useState<'kitchen' | 'staff'>('kitchen');
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const tooMuch = quantity !== null && quantity > lot.quantity;
  const amount =
    quantity === null || tooMuch
      ? undefined
      : money.format(partValue(lot.quantity, quantity, lot.pricePer1000));

  async function submit() {
    if (quantity === null || tooMuch) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await run('stock.withdraw', {
        articleId: article.id,
        lotId: lot.lotId,
        quantity,
        purpose,
        ...note(text),
      });
      onDone(
        t.withdraw.done(
          formatQuantity(result.consumed, article.unit),
          article.name,
          money.format(result.valueRappen),
        ),
      );
    } catch (failure) {
      setError(errorText(failure));
      setBusy(false);
    }
  }

  return (
    <LotForm
      article={article}
      lot={lot}
      onClose={onClose}
      onSubmit={() => {
        void submit();
      }}
      summary={
        quantity === null || amount === undefined
          ? undefined
          : t.withdraw.summary(formatQuantity(quantity, article.unit), article.name, amount)
      }
      action={t.withdraw.action}
      error={error}
      busy={busy}
    >
      <QuantityField
        label={t.quantity}
        unit={article.unit}
        value={quantity}
        onChange={setQuantity}
        positive
        required
        error={tooMuch ? t.tooMuch(formatQuantity(lot.quantity, article.unit)) : null}
      />
      <ChoiceChips
        legend={t.withdraw.purpose}
        segmented
        options={[
          { value: 'kitchen', label: t.withdraw.purposes.kitchen },
          { value: 'staff', label: t.withdraw.purposes.staff },
        ]}
        value={purpose}
        onChange={setPurpose}
      />
      <TextArea label={t.note} optional rows={2} maxLength={300} value={text} onChange={setText} />
    </LotForm>
  );
}

/** Writes a lot or a part of it off, with the reason. */
function WriteOffForm({ article, lot, onClose, onDone }: LotFormProps) {
  const run = useCommand();
  const money = useMoney();
  const [draft, setDraft] = useState<WriteOffDraft>({
    quantity: lot.quantity,
    // Past its Verbrauchsdatum, the reason is known.
    reason: lot.mustNotUse ? 'expired' : null,
    note: '',
  });
  const [reasonMissing, setReasonMissing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fits = draft.quantity !== null && draft.quantity > 0 && draft.quantity <= lot.quantity;

  async function submit() {
    if (!writeOffReady(draft, lot.quantity)) {
      setReasonMissing(true);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await run('stock.writeOff', {
        lotId: lot.lotId,
        quantity: draft.quantity,
        reason: draft.reason,
        ...note(draft.note),
      });
      onDone(
        stockMessages.waste.done(
          formatQuantity(draft.quantity, article.unit),
          article.name,
          money.format(result.valueRappen),
        ),
      );
    } catch (failure) {
      setError(errorText(failure));
      setBusy(false);
    }
  }

  return (
    <LotForm
      article={article}
      lot={lot}
      onClose={onClose}
      onSubmit={() => {
        void submit();
      }}
      summary={
        fits && draft.quantity !== null
          ? stockMessages.waste.summary(
              formatQuantity(draft.quantity, article.unit),
              article.name,
              money.format(partValue(lot.quantity, draft.quantity, lot.pricePer1000)),
            )
          : undefined
      }
      action={t.writeOff.action}
      error={error}
      busy={busy}
    >
      <WriteOffFields
        unit={article.unit}
        lotQuantity={lot.quantity}
        draft={draft}
        onChange={setDraft}
        reasonMissing={reasonMissing}
      />
    </LotForm>
  );
}

/** Moves a lot, or a part of it, to another storage area. Nothing is gained or lost. */
function MoveForm({ article, lot, onClose, onDone }: LotFormProps) {
  const run = useCommand();
  const areas = useQuery('lookup.areas', {})?.areas ?? [];
  const [quantity, setQuantity] = useState<number | null>(lot.quantity);
  const [areaId, setAreaId] = useState<Id | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const tooMuch = quantity !== null && quantity > lot.quantity;
  const same = areaId === lot.area.id;
  const target = areas.find((area) => area.id === areaId);

  async function submit() {
    if (quantity === null || tooMuch || areaId === null || same) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await run('stock.move', {
        lotId: lot.lotId,
        areaId,
        // The whole lot moves as it is; a part becomes a lot of its own.
        ...(quantity === lot.quantity ? {} : { quantity }),
      });
      onDone(t.move.done(formatQuantity(quantity, article.unit), article.name, target?.name ?? ''));
    } catch (failure) {
      setError(errorText(failure));
      setBusy(false);
    }
  }

  return (
    <LotForm
      article={article}
      lot={lot}
      onClose={onClose}
      onSubmit={() => {
        void submit();
      }}
      summary={
        quantity === null || tooMuch || target === undefined || same
          ? undefined
          : t.move.summary(formatQuantity(quantity, article.unit), article.name, target.name)
      }
      action={t.move.action}
      error={error}
      busy={busy}
    >
      <AreaPicker
        label={t.move.area}
        value={areaId}
        onChange={setAreaId}
        required
        hint={t.move.from(lot.area.name)}
        error={same ? t.move.same : null}
      />
      <QuantityField
        label={t.quantity}
        unit={article.unit}
        value={quantity}
        onChange={setQuantity}
        positive
        required
        error={tooMuch ? t.tooMuch(formatQuantity(lot.quantity, article.unit)) : null}
      />
    </LotForm>
  );
}
