import {
  allergenLabel,
  PLAN_SLOTS,
  planSlotLabel,
  type AllergenId,
  type Diet,
  type PlanLine,
  type PlanSlot,
} from '@randen/core';
import { ArrowDown, ArrowUp, Pencil } from 'lucide-react';
import { useState } from 'react';
import { errorText, useCommand } from '../../app/hooks';
import { AllergenPicker } from '../../ui/AllergenPicker';
import { Button } from '../../ui/Button';
import { FormActions } from '../../ui/FormActions';
import { SelectField } from '../../ui/SelectField';
import { Sheet } from '../../ui/Sheet';
import { TextField } from '../../ui/TextField';
import { useToast } from '../../ui/Toast';
import { productionMessages } from './messages';

const t = productionMessages;
const DIETS: readonly Diet[] = ['vegan', 'vegetarian'];

/** A line of the plan: a short description of what it holds and promises. */
function describeLine(line: PlanLine): string {
  const parts = [line.slot === undefined ? t.lines.slotAny : planSlotLabel(line.slot)];
  if (line.requiredDiet !== undefined) {
    parts.push(t.diets[line.requiredDiet]);
  }
  if (line.freeOf.length > 0) {
    parts.push(`${t.lines.freeOf}: ${line.freeOf.map(allergenLabel).join(', ')}`);
  }
  if (!line.active) {
    parts.push(t.lines.inactive);
  }
  return parts.join(' · ');
}

/**
 * The menu lines of the plan: create, rename, order, deactivate (ADR-0015). A line is a fixed
 * list such as «Menü 1» or «Vegi»; what it promises is checked against the dishes of each day.
 */
export function LinesSheet({
  open,
  lines,
  onClose,
}: {
  open: boolean;
  lines: readonly PlanLine[];
  onClose: () => void;
}) {
  const run = useCommand();
  const toast = useToast();
  const [name, setName] = useState('');
  const [slot, setSlot] = useState<PlanSlot | null>(null);
  const [diet, setDiet] = useState<Diet | null>(null);
  const [freeOf, setFreeOf] = useState<AllergenId[]>([]);
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    setError(null);
    try {
      await run('plan.lineCreate', {
        name,
        freeOf,
        ...(slot === null ? {} : { slot }),
        ...(diet === null ? {} : { requiredDiet: diet }),
      });
      toast({ text: t.lines.created(name.trim()), tone: 'ok' });
      setName('');
      setSlot(null);
      setDiet(null);
      setFreeOf([]);
    } catch (caught) {
      setError(errorText(caught));
    }
  }

  async function move(line: PlanLine, delta: -1 | 1) {
    const order = lines.map((row) => row.id);
    const index = order.indexOf(line.id);
    const target = index + delta;
    if (index < 0 || target < 0 || target >= order.length) {
      return;
    }
    const next = [...order];
    [next[index], next[target]] = [next[target] ?? line.id, next[index] ?? line.id];
    try {
      await run('plan.lineReorder', { lineIds: next });
    } catch (caught) {
      setError(errorText(caught));
    }
  }

  async function toggle(line: PlanLine) {
    try {
      await run('plan.lineUpdate', { lineId: line.id, active: !line.active });
    } catch (caught) {
      setError(errorText(caught));
    }
  }

  async function rename() {
    if (editing === null) {
      return;
    }
    try {
      await run('plan.lineUpdate', { lineId: editing.id, name: editing.name });
      setEditing(null);
      toast({ text: t.lines.saved, tone: 'ok' });
    } catch (caught) {
      setError(errorText(caught));
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title={t.lines.title}>
      <div className="space-y-6">
        <p className="text-ink-muted">{t.lines.text}</p>
        {lines.length === 0 ? <p>{t.lines.empty}</p> : null}
        <ul className="space-y-3">
          {lines.map((line, index) => (
            <li key={line.id} className="space-y-2 rounded-xl bg-surface p-3 shadow-card">
              {editing?.id === line.id ? (
                <div className="space-y-2">
                  <TextField
                    label={t.lines.name}
                    value={editing.name}
                    onChange={(value) => {
                      setEditing({ id: line.id, name: value });
                    }}
                  />
                  <FormActions
                    placement="inline"
                    primaryLabel={t.lines.rename}
                    onPrimary={() => {
                      void rename();
                    }}
                  />
                </div>
              ) : (
                <>
                  <p className="font-semibold break-words">{line.name}</p>
                  <p className="text-[0.875rem] text-ink-muted">{describeLine(line)}</p>
                </>
              )}
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  icon={ArrowUp}
                  aria-label={t.lines.up(line.name)}
                  disabled={index === 0}
                  onClick={() => {
                    void move(line, -1);
                  }}
                />
                <Button
                  variant="ghost"
                  size="sm"
                  icon={ArrowDown}
                  aria-label={t.lines.down(line.name)}
                  disabled={index === lines.length - 1}
                  onClick={() => {
                    void move(line, 1);
                  }}
                />
                <Button
                  variant="ghost"
                  size="sm"
                  icon={Pencil}
                  onClick={() => {
                    setEditing({ id: line.id, name: line.name });
                  }}
                >
                  {t.lines.rename}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    void toggle(line);
                  }}
                >
                  {line.active ? t.lines.deactivate : t.lines.activate}
                </Button>
              </div>
            </li>
          ))}
        </ul>

        <section aria-labelledby="new-line" className="space-y-4">
          <h2 id="new-line" className="text-[1.0625rem] font-bold">
            {t.lines.add}
          </h2>
          <TextField label={t.lines.name} value={name} onChange={setName} maxLength={40} />
          <SelectField
            label={t.lines.slot}
            placeholder={t.lines.slotAny}
            options={PLAN_SLOTS.map((value) => ({ value, label: planSlotLabel(value) }))}
            value={slot}
            onChange={setSlot}
          />
          <SelectField
            label={t.lines.diet}
            placeholder={t.lines.dietAny}
            options={DIETS.map((value) => ({ value, label: t.diets[value] }))}
            value={diet}
            onChange={setDiet}
          />
          <AllergenPicker legend={t.lines.freeOf} value={freeOf} onChange={setFreeOf} />
          <FormActions
            placement="inline"
            primaryLabel={t.lines.add}
            onPrimary={() => {
              void create();
            }}
            error={error}
          />
        </section>
      </div>
    </Sheet>
  );
}
