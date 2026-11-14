import { CircleAlert, type LucideIcon } from 'lucide-react';
import { Button } from './Button';

export interface FormActionsProps {
  /** The words of the main button: a verb, or a verb with its object («Wareneingang buchen»). */
  primaryLabel: string;
  /** Without it the main button sends the form around it (`type="submit"`). */
  onPrimary?: (() => void) | undefined;
  primaryIcon?: LucideIcon | undefined;
  /** Keeps the main button from being used: while saving, or while the form has nothing to save. */
  primaryDisabled?: boolean | undefined;
  /** The quiet second button, e.g. «Abbrechen». Shown only with both label and action. */
  secondaryLabel?: string | undefined;
  onSecondary?: (() => void) | undefined;
  /** One sentence with numbers that says what the main button will do: «3 Chargen, CHF 412.60». */
  summary?: string | undefined;
  /** The message of a rejected command (`errorText`), read out at once. */
  error?: string | null | undefined;
  /**
   * `page` (default): on the phone the row sticks above the tab bar while the form scrolls;
   * from 1024 px it sits at the end of the form. `inline`: always at the end, for a form inside
   * a sheet, a dialog or a card.
   */
  placement?: 'page' | 'inline' | undefined;
  className?: string | undefined;
}

/*
 * The tab bar of the phone is fixed, 4 rem high plus its hairline and the safe area. The row
 * sticks right above it and gets a ground of its own, so text scrolling underneath stays
 * readable; the negative margin lets that ground reach the edges of the screen.
 */
const STICKY =
  'sticky bottom-[calc(4rem+1px+env(safe-area-inset-bottom))] z-10 -mx-4 bg-ground/95 px-4 py-3 backdrop-blur lg:static lg:mx-0 lg:bg-transparent lg:p-0 lg:backdrop-blur-none';

/**
 * The actions at the end of a form: one main button in Rotwein (full width on the phone, in
 * reach of the thumb) and at most one quiet button next to it. From 1024 px both sit at the end
 * of the form, the main button last.
 */
export function FormActions({
  primaryLabel,
  onPrimary,
  primaryIcon,
  primaryDisabled = false,
  secondaryLabel,
  onSecondary,
  summary,
  error,
  placement = 'page',
  className = '',
}: FormActionsProps) {
  const hasError = typeof error === 'string' && error !== '';
  return (
    <div className={`${placement === 'page' ? STICKY : ''} ${className}`}>
      <div role="alert">
        {hasError ? (
          <p className="mb-3 flex items-start gap-1.5 text-sm text-danger">
            <CircleAlert size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
            <span className="min-w-0">{error}</span>
          </p>
        ) : null}
      </div>
      {summary === undefined || summary === '' ? null : (
        <p className="mb-3 text-sm text-ink-muted tabular-nums lg:text-right">{summary}</p>
      )}
      <div className="flex gap-2 lg:justify-end">
        {secondaryLabel !== undefined && onSecondary !== undefined ? (
          <Button variant="secondary" onClick={onSecondary}>
            {secondaryLabel}
          </Button>
        ) : null}
        <Button
          type={onPrimary === undefined ? 'submit' : 'button'}
          {...(onPrimary === undefined ? {} : { onClick: onPrimary })}
          {...(primaryIcon === undefined ? {} : { icon: primaryIcon })}
          disabled={primaryDisabled}
          className="flex-1 lg:flex-none"
        >
          {primaryLabel}
        </Button>
      </div>
    </div>
  );
}
