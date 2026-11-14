import {
  formatQuantity,
  WASTE_REASONS,
  wasteReasonLabel,
  type Unit,
  type WasteReason,
} from '@randen/core';
import { ChoiceChips } from '../../ui/ChoiceChips';
import { QuantityField } from '../../ui/QuantityField';
import { TextArea } from '../../ui/TextField';
import { stockMessages } from './messages';

const t = stockMessages;

export interface WriteOffDraft {
  quantity: number | null;
  reason: WasteReason | null;
  note: string;
}

const REASON_OPTIONS = WASTE_REASONS.map((reason) => ({
  value: reason,
  label: wasteReasonLabel(reason),
  // What is wrong with the goods themselves is vermilion; the rest is a plain choice.
  danger: reason === 'expired' || reason === 'spoiled',
}));

interface WriteOffFieldsProps {
  unit: Unit;
  /** What the lot holds: the most that can be written off. */
  lotQuantity: number;
  draft: WriteOffDraft;
  onChange: (draft: WriteOffDraft) => void;
  /** True once the person tried to book without a reason. */
  reasonMissing: boolean;
  /** Prefix for the ids of the fields, so a page can focus them. */
  quantityId?: string | undefined;
}

/** True if the draft can be booked against a lot of this size. */
export function writeOffReady(
  draft: WriteOffDraft,
  lotQuantity: number,
): draft is WriteOffDraft & { quantity: number; reason: WasteReason } {
  return (
    draft.quantity !== null &&
    draft.quantity > 0 &&
    draft.quantity <= lotQuantity &&
    draft.reason !== null
  );
}

/**
 * How much of a lot is written off and why: the same three fields on the page «Abschreiber»
 * and in the sheet of a lot. The whole rest of the lot is the usual case and comes prefilled.
 */
export function WriteOffFields({
  unit,
  lotQuantity,
  draft,
  onChange,
  reasonMissing,
  quantityId,
}: WriteOffFieldsProps) {
  const tooMuch = draft.quantity !== null && draft.quantity > lotQuantity;
  return (
    <div className="space-y-4">
      <QuantityField
        id={quantityId}
        label={t.waste.quantity}
        unit={unit}
        value={draft.quantity}
        onChange={(quantity) => {
          onChange({ ...draft, quantity });
        }}
        positive
        required
        hint={t.waste.whole(formatQuantity(lotQuantity, unit))}
        error={tooMuch ? t.sheets.tooMuch(formatQuantity(lotQuantity, unit)) : null}
      />
      <ChoiceChips
        legend={t.waste.reason}
        options={REASON_OPTIONS}
        value={draft.reason}
        onChange={(reason) => {
          onChange({ ...draft, reason });
        }}
        error={reasonMissing && draft.reason === null ? t.waste.reasonMissing : null}
      />
      <TextArea
        label={t.waste.note}
        optional
        rows={2}
        maxLength={300}
        value={draft.note}
        onChange={(note) => {
          onChange({ ...draft, note });
        }}
      />
    </div>
  );
}
