import type { LucideIcon } from 'lucide-react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Link, type LinkProps } from 'react-router';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
/** `md` is the main action of a screen (48 px), `sm` an action in a row or a header (44 px). */
export type ButtonSize = 'md' | 'sm';

const variantClasses: Record<ButtonVariant, string> = {
  primary: 'bg-wine-700 text-white hover:bg-wine-800 active:bg-wine-900',
  secondary: 'border border-line bg-surface text-ink hover:bg-surface-muted',
  ghost: 'text-wine-700 hover:bg-wine-50',
  danger: 'bg-danger text-white hover:opacity-90 active:opacity-80',
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
}: Look) {
  // `text-center` and `py-2`: a long label breaks into two lines instead of being cut off.
  return `inline-flex items-center justify-center rounded-xl py-2 text-center font-semibold transition-colors disabled:opacity-50 aria-disabled:opacity-50 ${sizeClasses[size]} ${variantClasses[variant]} ${fullWidth ? 'w-full' : ''} ${className}`;
}

function Content({
  icon: Icon,
  size = 'md',
  children,
}: {
  icon: LucideIcon | undefined;
  size: ButtonSize | undefined;
  children: ReactNode;
}) {
  return (
    <>
      {Icon ? (
        <Icon size={size === 'sm' ? 18 : 20} aria-hidden="true" className="shrink-0" />
      ) : null}
      {children}
    </>
  );
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, Look {}

export function Button({
  variant,
  size,
  icon,
  fullWidth,
  className,
  type = 'button',
  children,
  ...rest
}: ButtonProps) {
  return (
    <button type={type} className={lookClasses({ variant, size, fullWidth, className })} {...rest}>
      <Content icon={icon} size={size}>
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
