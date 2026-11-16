import { LoaderCircle, type LucideIcon } from 'lucide-react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Link, type LinkProps } from 'react-router';

/**
 * `danger` is the outline for an ordinary page: vermilion text on a thin vermilion edge. The filled
 * `danger-solid` is only for the confirming step of a dialog: `ConfirmDialog` in `Sheet.tsx` with
 * `tone="danger"`, and `DeleteSection`.
 */
export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'danger-solid';
/** `md` is the main action of a screen (48 px), `sm` an action in a row or a header (44 px). */
export type ButtonSize = 'md' | 'sm';

/** The colour of each variant at rest. */
const variantClasses: Record<ButtonVariant, string> = {
  primary: 'bg-wine-700 text-white',
  secondary: 'border border-line bg-surface text-ink',
  ghost: 'text-wine-700',
  danger: 'border border-danger/40 bg-surface text-danger',
  'danger-solid': 'bg-danger text-white',
};

/** The hover and press feedback of each variant. A busy button drops it and keeps its colour. */
const variantFeedback: Record<ButtonVariant, string> = {
  primary: 'hover:bg-wine-800 active:bg-wine-900',
  secondary: 'hover:bg-surface-muted',
  ghost: 'hover:bg-wine-50',
  danger: 'hover:bg-danger-bg active:bg-danger-bg',
  'danger-solid': 'hover:opacity-90 active:opacity-80',
};

const sizeClasses: Record<ButtonSize, string> = {
  md: 'min-h-12 gap-2 px-5',
  sm: 'min-h-11 gap-1.5 px-3.5 text-[0.9375rem]',
};

interface Look {
  variant?: ButtonVariant | undefined;
  size?: ButtonSize | undefined;
  icon?: LucideIcon | undefined;
  fullWidth?: boolean | undefined;
  className?: string | undefined;
}

function lookClasses({
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  className = '',
  busy = false,
}: Look & { busy?: boolean | undefined }) {
  // A busy button keeps its full colour: it is working, not switched off. Only a real disabled
  // button fades. It also gives no hover or press feedback, so it does not look pressable.
  const fade = busy ? 'cursor-progress' : 'disabled:opacity-50 aria-disabled:opacity-50';
  const feedback = busy ? '' : variantFeedback[variant];
  // `text-center` and `py-2`: a long label breaks into two lines instead of being cut off.
  return `inline-flex items-center justify-center rounded-xl py-2 text-center font-semibold transition-colors ${fade} ${sizeClasses[size]} ${variantClasses[variant]} ${feedback} ${fullWidth ? 'w-full' : ''} ${className}`;
}

function Content({
  icon: Icon,
  size = 'md',
  spin = false,
  children,
}: {
  icon: LucideIcon | undefined;
  size: ButtonSize | undefined;
  spin?: boolean | undefined;
  children: ReactNode;
}) {
  return (
    <>
      {Icon ? (
        <Icon
          size={size === 'sm' ? 18 : 20}
          aria-hidden="true"
          className={`shrink-0 ${spin ? 'animate-spin motion-reduce:animate-none' : ''}`}
        />
      ) : null}
      {children}
    </>
  );
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, Look {
  /** The action is running: the symbol turns, the label stays, no second press. */
  busy?: boolean | undefined;
}

/**
 * A button. `busy` says that the action is running: the symbol turns, the label stays, `aria-busy`
 * tells assistive technology why, and a press does nothing. While it runs it keeps its colour and
 * gives no hover or press feedback. The button is `aria-disabled` rather than `disabled`, so it
 * keeps keyboard focus and its place in the tab order while it runs (a native disabled button would
 * drop the focus).
 */
export function Button({
  variant,
  size,
  icon,
  fullWidth,
  className,
  type = 'button',
  busy = false,
  disabled = false,
  onClick,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={lookClasses({ variant, size, fullWidth, className, busy })}
      disabled={disabled}
      aria-disabled={busy ? 'true' : undefined}
      aria-busy={busy ? 'true' : undefined}
      onClick={(event) => {
        // A busy button swallows the press, including the submit of its form.
        if (busy) {
          event.preventDefault();
          return;
        }
        onClick?.(event);
      }}
      {...rest}
    >
      <Content icon={busy ? LoaderCircle : icon} size={size} spin={busy}>
        {children}
      </Content>
    </button>
  );
}

interface ButtonLinkProps extends Omit<LinkProps, 'className'>, Look {}

/** A link that looks like a button: for actions that open another page («Wareneingang»). */
export function ButtonLink({
  variant,
  size,
  icon,
  fullWidth,
  className,
  children,
  ...rest
}: ButtonLinkProps) {
  return (
    <Link className={lookClasses({ variant, size, fullWidth, className })} {...rest}>
      <Content icon={icon} size={size}>
        {children}
      </Content>
    </Link>
  );
}
