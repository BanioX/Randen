import { CommandError, type Id, type StaffRole } from '@randen/core';
import { useState } from 'react';
import { errorText, useCommand } from '../../app/hooks';
import { useAppData } from '../../app/AppData';
import { messages } from '../../app/messages';
import { Button } from '../../ui/Button';
import { ConfirmDialog } from '../../ui/Sheet';
import { FormActions } from '../../ui/FormActions';
import { Notice } from '../../ui/Notice';
import { SelectField } from '../../ui/SelectField';
import { Sheet } from '../../ui/Sheet';
import { Switch } from '../../ui/Switch';
import { TextField } from '../../ui/TextField';
import { useToast } from '../../ui/Toast';
import { settingsMessages } from './messages';
import { roleOptions } from './shared';

const t = settingsMessages.team;

/** One person of the team as the list shows her or him. */
export interface StaffDraft {
  id: Id;
  name: string;
  role: StaffRole;
  active: boolean;
  acting: boolean;
}

interface StaffSheetProps {
  open: boolean;
  /** The person to edit; without it the sheet adds one. */
  member?: StaffDraft | undefined;
  /** Whether this is the only active person (it cannot be removed then). */
  lastActive: boolean;
  onClose: () => void;
}

/**
 * «Person erfassen» and «Person bearbeiten» in a sheet (H3). Editing offers the switch to the
 * person (the acting one, «Als diese Person arbeiten») and the removal, which needs a
 * confirmation. The form lives inside the sheet, so every opening starts from the stored values.
 */
export function StaffSheet(props: StaffSheetProps) {
  return (
    <Sheet
      open={props.open}
      onClose={props.onClose}
      title={props.member === undefined ? t.createTitle : t.editTitle}
    >
      <StaffForm {...props} />
    </Sheet>
  );
}

function StaffForm({ member, lastActive, onClose }: Omit<StaffSheetProps, 'open'>) {
  const run = useCommand();
  const toast = useToast();
  const { setStaff } = useAppData();
  const [name, setName] = useState(member?.name ?? '');
  const [role, setRole] = useState<StaffRole | null>(member?.role ?? 'cook');
  const [active, setActive] = useState(member?.active ?? true);
  const [nameError, setNameError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [askRemove, setAskRemove] = useState(false);

  const removable = member !== undefined && !member.acting && !lastActive;

  async function save() {
    if (role === null) {
      return;
    }
    setBusy(true);
    setError(null);
    setNameError(null);
    try {
      await run('staff.save', {
        ...(member === undefined ? {} : { staffId: member.id }),
        name: name.trim(),
        role,
        active,
      });
      toast({ text: member === undefined ? t.created(name.trim()) : t.saved });
      onClose();
    } catch (failure) {
      setBusy(false);
      if (failure instanceof CommandError && failure.code === 'duplicate_name') {
        setNameError(t.duplicate);
      } else {
        setError(errorText(failure));
      }
    }
  }

  async function remove() {
    if (member === undefined) {
      return;
    }
    try {
      await run('staff.remove', { staffId: member.id });
      toast({ text: t.removed(member.name) });
      onClose();
    } catch (failure) {
      setAskRemove(false);
      setError(errorText(failure));
    }
  }

  return (
    <div className="space-y-5">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
        className="space-y-5"
      >
        <TextField
          label={t.name}
          value={name}
          onChange={(value) => {
            setName(value);
            setNameError(null);
          }}
          error={nameError}
          required
          maxLength={60}
          autoComplete="off"
        />
        <SelectField
          label={t.role}
          options={roleOptions()}
          value={role}
          onChange={setRole}
          required
        />
        <Switch
          label={t.active}
          description={t.activeHint}
          checked={active}
          disabled={member?.active === true && lastActive}
          onChange={setActive}
        />
        <FormActions
          primaryLabel={messages.actions.save}
          primaryBusy={busy}
          error={error}
          placement="inline"
        />
      </form>

      {member === undefined ? null : (
        <div className="space-y-3 border-t border-line pt-5">
          {member.acting ? null : (
            <Button
              variant="secondary"
              fullWidth
              disabled={!member.active}
              onClick={() => {
                setStaff(member.id);
                toast({ text: t.actingNow(member.name) });
                onClose();
              }}
            >
              {t.actAs}
            </Button>
          )}
          {removable ? (
            <Button
              variant="danger"
              fullWidth
              onClick={() => {
                setAskRemove(true);
              }}
            >
              {t.remove}
            </Button>
          ) : (
            <Notice tone="info">{member.acting ? t.removeActing : t.removeLast}</Notice>
          )}
          <ConfirmDialog
            open={askRemove}
            title={t.removeTitle}
            text={t.removeText(member.name)}
            confirmLabel={t.removeConfirm}
            cancelLabel={t.removeCancel}
            tone="danger"
            onConfirm={() => {
              void remove();
            }}
            onCancel={() => {
              setAskRemove(false);
            }}
          />
        </div>
      )}
    </div>
  );
}
