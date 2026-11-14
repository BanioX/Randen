import { X } from 'lucide-react';
import {
  useEffect,
  useId,
  useRef,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
  type SyntheticEvent,
} from 'react';
import { Button } from './Button';
import { displayMessages } from './messages.display';

interface SheetProps {
  open: boolean;
  /** Called for Escape, the close button, a tap beside the sheet and the back gesture. */
  onClose: () => void;
  title: string;
  children: ReactNode;
  /** Stays at the bottom while the content scrolls: the buttons of the sheet. */
  footer?: ReactNode | undefined;
  /** `alertdialog` for a question that must be answered (see `ConfirmDialog`). */
  role?: 'dialog' | 'alertdialog' | undefined;
  /** Hides the close button where the footer already offers «Abbrechen». */
  hideClose?: boolean | undefined;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * A modal: a sheet from the bottom on the phone, a centred dialog from tablet width. Built on
 * `<dialog>` and `showModal()`, so it lies above everything (also the tab bar), keeps the focus
 * inside and makes the page behind it inert. The focus returns to what opened it.
 *
 * On open the focus goes to the element marked `data-autofocus`, else to the first one that can
 * take it. The content is only rendered while the sheet is open.
 */
export function Sheet({
  open,
  onClose,
  title,
  children,
  footer,
  role = 'dialog',
  hideClose = false,
}: SheetProps) {
  const titleId = useId();
  const bodyId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const opener = useRef<Element | null>(null);
  /** True while the browser's own modal dialog is in use: it reports Escape as `cancel`. */
  const native = useRef(false);
  /** Set when the page closes the sheet: the `close` event that follows is not a request. */
  const closedByPage = useRef(false);
  /** A drag that starts inside (selecting text in a field) must not close the sheet. */
  const pressedBeside = useRef(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog === null || !open) {
      return;
    }
    closedByPage.current = false;
    opener.current = document.activeElement;
    // Browsers without `showModal` (and jsdom) still get an open, labelled dialog.
    native.current = typeof dialog.showModal === 'function';
    if (native.current) {
      dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
    const first =
      dialog.querySelector<HTMLElement>('[data-autofocus]') ??
      dialog.querySelector<HTMLElement>(FOCUSABLE) ??
      dialog;
    first.focus();
    return () => {
      closedByPage.current = true;
      if (native.current) {
        dialog.close();
      } else {
        dialog.removeAttribute('open');
      }
      if (opener.current instanceof HTMLElement && opener.current.isConnected) {
        opener.current.focus();
      }
      opener.current = null;
    };
  }, [open]);

  function onCancel(event: SyntheticEvent<HTMLDialogElement>) {
    // Escape and the back gesture. The page decides when the sheet closes: it sets `open`.
    event.preventDefault();
    onClose();
  }

  function onNativeClose() {
    // The browser closed the dialog on its own (a second Escape): tell the page.
    if (!closedByPage.current) {
      onClose();
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLDialogElement>) {
    // Only without the browser's modal dialog; with it, Escape arrives as `cancel`.
    if (!native.current && event.key === 'Escape') {
      event.preventDefault();
      onClose();
    }
  }

  function onPress(event: MouseEvent<HTMLDialogElement>) {
    pressedBeside.current = event.target === event.currentTarget;
  }

  function onBackdropClick(event: MouseEvent<HTMLDialogElement>) {
    // The panel fills the dialog: a click on the dialog itself landed beside it.
    if (event.target === event.currentTarget && pressedBeside.current) {
      onClose();
    }
    pressedBeside.current = false;
  }

  return (
    <dialog
      ref={dialogRef}
      role={role}
      aria-labelledby={titleId}
      aria-describedby={role === 'alertdialog' ? bodyId : undefined}
      tabIndex={-1}
      onCancel={onCancel}
      onClose={onNativeClose}
      onKeyDown={onKeyDown}
      onMouseDown={onPress}
      onClick={onBackdropClick}
      className="fixed inset-x-0 top-auto bottom-0 z-50 m-0 w-full max-w-none overflow-hidden rounded-t-3xl bg-surface p-0 text-ink shadow-float backdrop:bg-wine-950/50 open:starting:translate-y-8 motion-safe:transition-transform motion-safe:duration-200 motion-safe:ease-out md:inset-0 md:m-auto md:max-w-lg md:rounded-3xl"
    >
      {open ? (
        <div className="flex max-h-[85dvh] flex-col">
          <div className="flex items-start justify-between gap-3 px-5 pt-4 pb-2">
            <h2
              id={titleId}
              className="min-w-0 py-2 text-xl font-semibold break-words hyphens-calm"
            >
              {title}
            </h2>
            {hideClose ? null : (
              <button
                type="button"
                onClick={onClose}
                aria-label={displayMessages.close}
                className="-mr-2 flex size-11 shrink-0 items-center justify-center rounded-full text-ink-muted hover:bg-surface-muted"
              >
                <X size={22} aria-hidden="true" />
              </button>
            )}
          </div>
          <div
            id={bodyId}
            className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-5"
          >
            {children}
          </div>
          {footer === undefined ? (
            <div aria-hidden="true" className="h-[env(safe-area-inset-bottom)] md:hidden" />
          ) : (
            <div className="border-t border-line px-5 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] md:pb-4">
              {footer}
            </div>
          )}
        </div>
      ) : null}
    </dialog>
  );
}

interface ConfirmDialogProps {
  open: boolean;
  /** The question: «Charge abschreiben?» */
  title: string;
  /** What happens, in one or two sentences. */
  text: string;
  /** Names the deed: «Abschreiben», «Löschen». */
  confirmLabel: string;
  cancelLabel?: string | undefined;
  /** `danger` for what cannot be undone: a vermilion button, and the focus starts on «Abbrechen». */
  tone?: 'danger' | 'default' | undefined;
  onConfirm: () => void;
  onCancel: () => void;
}

/** A question before a step that matters. Escape and a tap beside it cancel. */
export function ConfirmDialog({
  open,
  title,
  text,
  confirmLabel,
  cancelLabel = displayMessages.cancel,
  tone = 'default',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const danger = tone === 'danger';
  return (
    <Sheet
      open={open}
      onClose={onCancel}
      title={title}
      role="alertdialog"
      hideClose
      footer={
        <div className="flex flex-col-reverse gap-2 md:flex-row md:justify-end">
          <Button variant="secondary" onClick={onCancel} data-autofocus={danger ? '' : undefined}>
            {cancelLabel}
          </Button>
          <Button
            variant={danger ? 'danger' : 'primary'}
            onClick={onConfirm}
            data-autofocus={danger ? undefined : ''}
          >
            {confirmLabel}
          </Button>
        </div>
      }
    >
      <p className="text-ink-muted">{text}</p>
    </Sheet>
  );
}
