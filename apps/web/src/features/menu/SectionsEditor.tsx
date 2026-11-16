import { courseLabel, type Id, type OperationOutput } from '@randen/core';
import {
  ChevronDown,
  ChevronUp,
  Pencil,
  Plus,
  Trash2,
  TriangleAlert,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useRef, useState, type SyntheticEvent } from 'react';
import { errorText, useCommand, useMoney } from '../../app/hooks';
import { Button } from '../../ui/Button';
import { DishPhoto } from '../../ui/DishPhoto';
import { FormActions } from '../../ui/FormActions';
import { GroupedList, GroupedListItem } from '../../ui/GroupedList';
import { Section } from '../../ui/Section';
import { ConfirmDialog, Sheet } from '../../ui/Sheet';
import { StatusChip } from '../../ui/StatusChip';
import { TextField } from '../../ui/TextField';
import { useToast } from '../../ui/Toast';
import { RecipePicker } from '../../ui/pickers';
import { menuMessages } from './messages';
import { problemLine } from './shared';

const t = menuMessages;
type EditorSection = OperationOutput<'menu.get'>['sections'][number];
type EditorDish = EditorSection['dishes'][number];

/** A section as the command takes it: a new one has no id yet. */
interface Draft {
  id?: Id;
  title: string;
  dishIds: Id[];
}

function draftsOf(sections: readonly EditorSection[]): Draft[] {
  return sections.map((section) => ({
    id: section.id,
    title: section.title,
    dishIds: section.dishes.map((dish) => dish.id),
  }));
}

/** The dialog or sheet open on the sections, if any. */
type Open =
  | { kind: 'dish'; sectionId: Id; title: string }
  | { kind: 'newSection' }
  | { kind: 'rename'; sectionId: Id; title: string }
  | null;

/** A dish line with its photo, course, price and open points; the moves are buttons (44 px). */
function DishLine({
  dish,
  first,
  last,
  showPrices,
  onMove,
  onRemove,
  disabled,
}: {
  dish: EditorDish;
  first: boolean;
  last: boolean;
  /** Whether the card shows prices: a missing price is an open point only then (as in the core). */
  showPrices: boolean;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
  disabled: boolean;
}) {
  const money = useMoney();
  const price =
    dish.priceRappen !== undefined
      ? money.format(dish.priceRappen)
      : showPrices
        ? t.sections.priceMissing
        : undefined;
  return (
    <GroupedListItem inset="icon">
      <div className="flex min-w-0 items-center gap-3 px-4 py-2.5">
        <DishPhoto
          photo={dish.photo}
          alt=""
          ratio="square"
          radius="md"
          className="size-12 shrink-0"
        />
        <div className="min-w-0 flex-1">
          <p className="leading-snug font-semibold break-words">{dish.name}</p>
          <p className="text-[0.8125rem] text-ink-muted">
            {courseLabel(dish.course)}
            {price === undefined ? null : (
              <>
                {' · '}
                <span className="tabular-nums">{price}</span>
              </>
            )}
            {dish.active ? null : ` · ${t.status.inactive}`}
          </p>
          {dish.problems.length === 0 ? null : (
            <span className="mt-1 inline-flex max-w-full">
              <StatusChip tone="soon" size="sm" icon={TriangleAlert}>
                {problemLine(dish.problems)}
              </StatusChip>
            </span>
          )}
        </div>
        <div className="flex shrink-0 items-center">
          <IconButton
            label={t.sections.dishUp(dish.name)}
            icon={ChevronUp}
            disabled={first || disabled}
            onClick={() => {
              onMove(-1);
            }}
          />
          <IconButton
            label={t.sections.dishDown(dish.name)}
            icon={ChevronDown}
            disabled={last || disabled}
            onClick={() => {
              onMove(1);
            }}
          />
          <IconButton
            label={t.sections.dishRemove(dish.name)}
            icon={X}
            disabled={disabled}
            onClick={onRemove}
          />
        </div>
      </div>
    </GroupedListItem>
  );
}

/** A quiet icon button with a name for screen readers, 44 px at least. */
function IconButton({
  label,
  icon: Icon,
  disabled,
  onClick,
}: {
  label: string;
  icon: LucideIcon;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="grid size-11 place-items-center rounded-xl text-ink-muted transition-colors hover:bg-surface-muted hover:text-wine-700 disabled:opacity-40"
    >
      <Icon size={20} aria-hidden="true" />
    </button>
  );
}

/**
 * The sections of a card and the dishes in them: rename, move, remove, add. Each change is
 * one command that replaces the whole list, so the order always matches what is on screen.
 */
export function SectionsEditor({
  cardId,
  sections,
  showPrices,
}: {
  cardId: Id;
  sections: readonly EditorSection[];
  showPrices: boolean;
}) {
  const run = useCommand();
  const toast = useToast();
  const [open, setOpen] = useState<Open>(null);
  const [pickedDish, setPickedDish] = useState<{ id: Id; name: string } | null>(null);
  const [sheetTitle, setSheetTitle] = useState('');
  const [removing, setRemoving] = useState<EditorSection | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);

  /** Saves the whole list; one request at a time, so two taps cannot race. */
  function save(drafts: Draft[], done?: () => void) {
    if (pending.current) {
      return;
    }
    pending.current = true;
    setBusy(true);
    setError(null);
    run('menu.setSections', {
      cardId,
      sections: drafts.map((draft) => ({
        ...(draft.id === undefined ? {} : { id: draft.id }),
        title: draft.title,
        recipeIds: draft.dishIds,
      })),
    })
      .then(() => {
        done?.();
      })
      .catch((caught: unknown) => {
        setError(errorText(caught));
      })
      .finally(() => {
        pending.current = false;
        setBusy(false);
      });
  }

  function moveSection(index: number, direction: -1 | 1) {
    const drafts = draftsOf(sections);
    const target = index + direction;
    const moved = drafts[index];
    const other = drafts[target];
    if (moved === undefined || other === undefined) {
      return;
    }
    drafts[index] = other;
    drafts[target] = moved;
    save(drafts);
  }

  function moveDish(sectionIndex: number, dishIndex: number, direction: -1 | 1) {
    const drafts = draftsOf(sections);
    const draft = drafts[sectionIndex];
    const target = dishIndex + direction;
    const moved = draft?.dishIds[dishIndex];
    const other = draft?.dishIds[target];
    if (draft === undefined || moved === undefined || other === undefined) {
      return;
    }
    draft.dishIds[dishIndex] = other;
    draft.dishIds[target] = moved;
    save(drafts);
  }

  function removeDish(sectionIndex: number, dishIndex: number, name: string) {
    const drafts = draftsOf(sections);
    drafts[sectionIndex]?.dishIds.splice(dishIndex, 1);
    save(drafts, () => {
      toast({ text: t.sections.dishRemoved(name) });
    });
  }

  function removeSection(section: EditorSection) {
    setRemoving(null);
    save(
      draftsOf(sections).filter((draft) => draft.id !== section.id),
      () => {
        toast({ text: t.sections.removed(section.title) });
      },
    );
  }

  function askRemoveSection(section: EditorSection) {
    if (section.dishes.length === 0) {
      removeSection(section);
    } else {
      setRemoving(section);
    }
  }

  function closeSheet() {
    setOpen(null);
    setPickedDish(null);
    setError(null);
  }

  function openDish(section: EditorSection) {
    setPickedDish(null);
    setError(null);
    setOpen({ kind: 'dish', sectionId: section.id, title: section.title });
  }

  function addDish(sectionId: Id) {
    if (pickedDish === null) {
      return;
    }
    if (sections.some((section) => section.dishes.some((dish) => dish.id === pickedDish.id))) {
      setError(t.sheets.dishAlready);
      return;
    }
    const drafts = draftsOf(sections);
    drafts.find((draft) => draft.id === sectionId)?.dishIds.push(pickedDish.id);
    const name = pickedDish.name;
    save(drafts, () => {
      toast({ text: t.sheets.dishAdded(name), tone: 'ok' });
      closeSheet();
    });
  }

  function submitTitle(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const title = sheetTitle.trim();
    if (title === '' || open === null || open.kind === 'dish') {
      return;
    }
    if (open.kind === 'newSection') {
      save([...draftsOf(sections), { title, dishIds: [] }], closeSheet);
      return;
    }
    const sectionId = open.sectionId;
    save(
      draftsOf(sections).map((draft) => (draft.id === sectionId ? { ...draft, title } : draft)),
      closeSheet,
    );
  }

  const dishSection = open?.kind === 'dish' ? open : null;
  const titleOpen = open?.kind === 'newSection' || open?.kind === 'rename';

  return (
    <Section title={t.sections.title}>
      <div className="space-y-4">
        {error === null ? null : (
          <p role="alert" className="text-sm font-semibold text-danger">
            {error}
          </p>
        )}

        {sections.length === 0 ? (
          <p className="text-ink-muted">{t.sections.empty}</p>
        ) : (
          sections.map((section, sectionIndex) => (
            <div key={section.id} className="space-y-2">
              <div className="flex items-center gap-1 pl-1">
                <h3 className="min-w-0 flex-1 text-[1.0625rem] font-semibold break-words">
                  {section.title}
                </h3>
                <IconButton
                  label={t.sections.up(section.title)}
                  icon={ChevronUp}
                  disabled={sectionIndex === 0 || busy}
                  onClick={() => {
                    moveSection(sectionIndex, -1);
                  }}
                />
                <IconButton
                  label={t.sections.down(section.title)}
                  icon={ChevronDown}
                  disabled={sectionIndex === sections.length - 1 || busy}
                  onClick={() => {
                    moveSection(sectionIndex, 1);
                  }}
                />
                <IconButton
                  label={`${t.sections.rename}: ${section.title}`}
                  icon={Pencil}
                  disabled={busy}
                  onClick={() => {
                    setSheetTitle(section.title);
                    setError(null);
                    setOpen({ kind: 'rename', sectionId: section.id, title: section.title });
                  }}
                />
                <IconButton
                  label={`${t.sections.remove}: ${section.title}`}
                  icon={Trash2}
                  disabled={busy}
                  onClick={() => {
                    askRemoveSection(section);
                  }}
                />
              </div>

              {section.dishes.length === 0 ? (
                <p className="rounded-2xl bg-surface px-4 py-3 text-ink-muted shadow-card">
                  {t.sections.noDishes}
                </p>
              ) : (
                <GroupedList label={section.title}>
                  {section.dishes.map((dish, dishIndex) => (
                    <DishLine
                      key={dish.id}
                      dish={dish}
                      first={dishIndex === 0}
                      last={dishIndex === section.dishes.length - 1}
                      showPrices={showPrices}
                      disabled={busy}
                      onMove={(direction) => {
                        moveDish(sectionIndex, dishIndex, direction);
                      }}
                      onRemove={() => {
                        removeDish(sectionIndex, dishIndex, dish.name);
                      }}
                    />
                  ))}
                </GroupedList>
              )}

              <Button
                variant="secondary"
                size="sm"
                icon={Plus}
                busy={busy}
                onClick={() => {
                  openDish(section);
                }}
              >
                {t.sections.addDish}
              </Button>
            </div>
          ))
        )}

        <Button
          variant="secondary"
          icon={Plus}
          busy={busy}
          onClick={() => {
            setSheetTitle('');
            setError(null);
            setOpen({ kind: 'newSection' });
          }}
        >
          {t.sections.add}
        </Button>
      </div>

      <Sheet
        open={dishSection !== null}
        onClose={closeSheet}
        title={dishSection === null ? '' : t.sheets.addDish(dishSection.title)}
        footer={
          <div className="space-y-3">
            {error === null ? null : (
              <p role="alert" className="text-sm font-semibold text-danger">
                {error}
              </p>
            )}
            <Button
              fullWidth
              busy={busy}
              disabled={pickedDish === null}
              onClick={() => {
                if (dishSection !== null) {
                  addDish(dishSection.sectionId);
                }
              }}
            >
              {t.sheets.dishSubmit}
            </Button>
          </div>
        }
      >
        <RecipePicker
          label={t.sheets.dish}
          kind="dish"
          hint={t.sheets.dishHint}
          value={pickedDish?.id ?? null}
          onChange={(id, recipe) => {
            setError(null);
            setPickedDish(id === null || recipe === null ? null : { id, name: recipe.name });
          }}
        />
      </Sheet>

      <Sheet
        open={titleOpen}
        onClose={closeSheet}
        title={open?.kind === 'rename' ? t.sheets.renameSection : t.sheets.newSection}
      >
        <form onSubmit={submitTitle} className="space-y-5">
          <TextField
            label={t.sheets.sectionTitle}
            hint={t.sheets.sectionHint}
            value={sheetTitle}
            onChange={setSheetTitle}
            required
            maxLength={60}
            autoComplete="off"
          />
          <FormActions
            primaryLabel={t.sheets.sectionSubmit}
            error={error}
            placement="inline"
            primaryBusy={busy}
          />
        </form>
      </Sheet>

      <ConfirmDialog
        open={removing !== null}
        title={removing === null ? '' : t.sections.removeTitle(removing.title)}
        text={t.sections.removeText}
        confirmLabel={t.sections.removeConfirm}
        cancelLabel={menuMessages.removeCard.cancel}
        tone="danger"
        onConfirm={() => {
          if (removing !== null) {
            removeSection(removing);
          }
        }}
        onCancel={() => {
          setRemoving(null);
        }}
      />
    </Section>
  );
}
