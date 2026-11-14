import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConfirmDialog, Sheet } from './Sheet';

/** A page with a button that opens a sheet, as a feature would use it. */
function Page({ onClose }: { onClose?: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
        }}
      >
        Charge abschreiben
      </button>
      <Sheet
        open={open}
        onClose={() => {
          onClose?.();
          setOpen(false);
        }}
        title="Abschreiber erfassen"
        footer={<button type="button">Abschreiben</button>}
      >
        <p>Lachsfilet, 1.8 kg</p>
        <input aria-label="Menge" />
      </Sheet>
    </>
  );
}

function DeletePage({
  tone,
  onConfirm,
  onCancel,
}: {
  tone?: 'danger' | 'default';
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
        }}
      >
        Rezept löschen
      </button>
      <ConfirmDialog
        open={open}
        tone={tone}
        title="Rezept löschen?"
        text="Das Rezept wird gelöscht. Verkäufe bleiben im Journal."
        confirmLabel="Löschen"
        onConfirm={() => {
          onConfirm();
          setOpen(false);
        }}
        onCancel={() => {
          onCancel();
          setOpen(false);
        }}
      />
    </>
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Sheet', () => {
  it('is closed until the page opens it, and renders its content only then', () => {
    render(<Page />);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByText('Lachsfilet, 1.8 kg')).toBeNull();
  });

  it('opens as a dialog named by its title, with content and footer', async () => {
    render(<Page />);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Charge abschreiben' }));
    const dialog = screen.getByRole('dialog', { name: 'Abschreiber erfassen' });
    expect(
      within(dialog).getByRole('heading', { level: 2, name: 'Abschreiber erfassen' }),
    ).toBeTruthy();
    expect(within(dialog).getByText('Lachsfilet, 1.8 kg')).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: 'Abschreiben' })).toBeTruthy();
  });

  it('moves the focus into the sheet and back to the opener when it closes', async () => {
    const user = userEvent.setup();
    render(<Page />);
    const opener = screen.getByRole('button', { name: 'Charge abschreiben' });
    await user.click(opener);
    const dialog = screen.getByRole('dialog');
    expect(dialog.contains(document.activeElement)).toBe(true);
    expect(document.activeElement).toBe(within(dialog).getByRole('button', { name: 'Schliessen' }));

    await user.click(within(dialog).getByRole('button', { name: 'Schliessen' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it('closes on Escape, asking the page exactly once', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<Page onClose={onClose} />);
    const opener = screen.getByRole('button', { name: 'Charge abschreiben' });
    await user.click(opener);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(opener);
  });

  it('closes on a click beside the panel, not on a click inside it', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<Page onClose={onClose} />);
    await user.click(screen.getByRole('button', { name: 'Charge abschreiben' }));
    const dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByText('Lachsfilet, 1.8 kg'));
    expect(onClose).not.toHaveBeenCalled();
    // The dialog element itself is what lies beside the panel (its backdrop).
    await user.click(dialog);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('can be opened again after it was closed', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<Page onClose={onClose} />);
    const opener = screen.getByRole('button', { name: 'Charge abschreiben' });
    await user.click(opener);
    await user.keyboard('{Escape}');
    await user.click(opener);
    expect(screen.getByRole('dialog', { name: 'Abschreiber erfassen' })).toBeTruthy();
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('uses the modal dialog of the browser where there is one', async () => {
    const showModal = vi.fn(function (this: HTMLDialogElement) {
      this.setAttribute('open', '');
    });
    const close = vi.fn(function (this: HTMLDialogElement) {
      this.removeAttribute('open');
      this.dispatchEvent(new Event('close'));
    });
    Object.assign(HTMLDialogElement.prototype, { showModal, close });
    try {
      const user = userEvent.setup();
      const onClose = vi.fn();
      render(<Page onClose={onClose} />);
      const opener = screen.getByRole('button', { name: 'Charge abschreiben' });
      await user.click(opener);
      expect(showModal).toHaveBeenCalledTimes(1);

      // The browser reports Escape and the back gesture as a `cancel` event it would act on.
      const cancel = new Event('cancel', { cancelable: true });
      fireEvent(screen.getByRole('dialog'), cancel);
      expect(cancel.defaultPrevented).toBe(true);
      // Once: neither the key nor the `close` event of the page's own closing asks again.
      expect(onClose).toHaveBeenCalledTimes(1);
      expect(close).toHaveBeenCalledTimes(1);
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(document.activeElement).toBe(opener);
    } finally {
      Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal');
      Reflect.deleteProperty(HTMLDialogElement.prototype, 'close');
    }
  });

  it('tells the page when the browser closes the dialog by itself', async () => {
    const showModal = vi.fn(function (this: HTMLDialogElement) {
      this.setAttribute('open', '');
    });
    const close = vi.fn(function (this: HTMLDialogElement) {
      this.removeAttribute('open');
      this.dispatchEvent(new Event('close'));
    });
    Object.assign(HTMLDialogElement.prototype, { showModal, close });
    try {
      const onClose = vi.fn();
      render(<Page onClose={onClose} />);
      await userEvent.setup().click(screen.getByRole('button', { name: 'Charge abschreiben' }));
      const dialog = screen.getByRole('dialog');
      act(() => {
        dialog.removeAttribute('open');
        dialog.dispatchEvent(new Event('close'));
      });
      expect(onClose).toHaveBeenCalledTimes(1);
    } finally {
      Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal');
      Reflect.deleteProperty(HTMLDialogElement.prototype, 'close');
    }
  });

  it('asks again if the page chose to stay open', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <Sheet open onClose={onClose} title="Ungesicherte Änderungen">
        <p>Inhalt</p>
      </Sheet>,
    );
    await user.keyboard('{Escape}');
    await user.click(screen.getByRole('button', { name: 'Schliessen' }));
    expect(onClose).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('starts on the element marked data-autofocus', () => {
    render(
      <Sheet open onClose={() => undefined} title="Menge ändern">
        <input aria-label="Menge" data-autofocus="" />
      </Sheet>,
    );
    expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'Menge' }));
  });
});

describe('ConfirmDialog', () => {
  it('asks as an alert dialog with the question as its name and the text as its description', async () => {
    render(<DeletePage tone="danger" onConfirm={vi.fn()} onCancel={vi.fn()} />);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Rezept löschen' }));
    const dialog = screen.getByRole('alertdialog', { name: 'Rezept löschen?' });
    const describedBy = dialog.getAttribute('aria-describedby');
    expect(describedBy).not.toBeNull();
    expect(document.getElementById(describedBy ?? '')?.textContent).toBe(
      'Das Rezept wird gelöscht. Verkäufe bleiben im Journal.',
    );
    // No close button: «Abbrechen» is the way out.
    expect(within(dialog).queryByRole('button', { name: 'Schliessen' })).toBeNull();
  });

  it('starts on «Abbrechen» for a dangerous step and marks the deed in vermilion', async () => {
    render(<DeletePage tone="danger" onConfirm={vi.fn()} onCancel={vi.fn()} />);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Rezept löschen' }));
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Abbrechen' }));
    expect(screen.getByRole('button', { name: 'Löschen' }).className).toContain('bg-danger');
  });

  it('starts on the confirming button for a harmless step', async () => {
    render(<DeletePage onConfirm={vi.fn()} onCancel={vi.fn()} />);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Rezept löschen' }));
    const confirm = screen.getByRole('button', { name: 'Löschen' });
    expect(document.activeElement).toBe(confirm);
    expect(confirm.className).toContain('bg-wine-700');
  });

  it('confirms', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(<DeletePage tone="danger" onConfirm={onConfirm} onCancel={onCancel} />);
    const opener = screen.getByRole('button', { name: 'Rezept löschen' });
    await user.click(opener);
    await user.click(screen.getByRole('button', { name: 'Löschen' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it('cancels with the button and with Escape', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(<DeletePage tone="danger" onConfirm={onConfirm} onCancel={onCancel} />);
    const opener = screen.getByRole('button', { name: 'Rezept löschen' });
    await user.click(opener);
    await user.click(screen.getByRole('button', { name: 'Abbrechen' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('alertdialog')).toBeNull();

    await user.click(opener);
    await user.keyboard('{Escape}');
    expect(onCancel).toHaveBeenCalledTimes(2);
    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });
});
