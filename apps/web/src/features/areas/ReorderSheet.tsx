import type { AreaKind, Id } from '@randen/core';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { errorText, useCommand } from '../../app/hooks';
import { areaLooks } from '../../ui/badges';
import { FormActions } from '../../ui/FormActions';
import { GroupedList, GroupedListItem } from '../../ui/GroupedList';
import { Sheet } from '../../ui/Sheet';
import { useToast } from '../../ui/Toast';
import { toneClasses } from '../../ui/tones';
import { areasMessages } from './messages';

const t = areasMessages.reorder;

interface Row {
  id: Id;
  name: string;
  kind: AreaKind;
}

const MOVE =
  'relative inline-flex size-11 shrink-0 items-center justify-center rounded-xl text-wine-800 hover:bg-surface-muted disabled:text-ink-muted/40 disabled:hover:bg-transparent';

/**
 * «Reihenfolge ändern»: the areas with a button up and a button down each, so the order can be
 * changed with a tap, by keyboard and with a screen reader alike; nothing hangs on dragging.
 */
export function ReorderSheet({
  open,
  areas,
  onClose,
}: {
  open: boolean;
  areas: readonly Row[];
  onClose: () => void;
}) {
  return (
    <Sheet open={open} onClose={onClose} title={t.title}>
      <ReorderForm areas={areas} onClose={onClose} />
    </Sheet>
  );
}

function ReorderForm({ areas, onClose }: { areas: readonly Row[]; onClose: () => void }) {
  const run = useCommand();
  const toast = useToast();
  const [order, setOrder] = useState(() => [...areas]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /** The button that keeps the focus after a move: a button at the end gets disabled. */
  const focus = useRef<string | null>(null);

  // After the move is drawn: back to a button of the row that moved.
  useEffect(() => {
    if (focus.current !== null) {
      document.getElementById(focus.current)?.focus();
      focus.current = null;
    }
  });

  function move(index: number, by: -1 | 1) {
    const next = [...order];
    const [row] = next.splice(index, 1);
    if (row !== undefined) {
      const to = index + by;
      next.splice(to, 0, row);
      setOrder(next);
      const atEnd = by < 0 ? to === 0 : to === next.length - 1;
      focus.current = `${row.id}-${by < 0 !== atEnd ? 'up' : 'down'}`;
    }
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await run('areas.reorder', { areaIds: order.map((row) => row.id) });
      toast({ text: t.saved });
      onClose();
    } catch (failure) {
      setBusy(false);
      setError(errorText(failure));
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-ink-muted">{t.hint}</p>
      <GroupedList label={t.title}>
        {order.map((row, index) => {
          const { icon: Icon, tone } = areaLooks[row.kind];
          return (
            <GroupedListItem key={row.id}>
              <div className="flex min-h-14 items-center gap-3 py-1.5 pr-2 pl-4">
                <span
                  className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${toneClasses[tone].chip}`}
                >
                  <Icon size={22} strokeWidth={1.75} aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1 font-semibold break-words">
                  <span className="sr-only">{t.position(index + 1)} </span>
                  {row.name}
                </span>
                <button
                  id={`${row.id}-up`}
                  type="button"
                  className={MOVE}
                  disabled={index === 0}
                  onClick={() => {
                    move(index, -1);
                  }}
                >
                  <ArrowUp size={20} aria-hidden="true" />
                  <span className="sr-only">
                    {t.up}, {row.name}
                  </span>
                </button>
                <button
                  id={`${row.id}-down`}
                  type="button"
                  className={MOVE}
                  disabled={index === order.length - 1}
                  onClick={() => {
                    move(index, 1);
                  }}
                >
                  <ArrowDown size={20} aria-hidden="true" />
                  <span className="sr-only">
                    {t.down}, {row.name}
                  </span>
                </button>
              </div>
            </GroupedListItem>
          );
        })}
      </GroupedList>
      <FormActions
        placement="inline"
        primaryLabel={t.save}
        onPrimary={() => {
          void save();
        }}
        primaryDisabled={busy}
        secondaryLabel={t.cancel}
        onSecondary={onClose}
        error={error}
      />
    </div>
  );
}
