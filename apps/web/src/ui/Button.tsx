import type { LucideIcon } from 'lucide-react';
import type { ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

const variantClasses: Record<Variant, string> = {
  primary: 'bg-wine-700 text-white hover:bg-wine-800 active:bg-wine-900',
  secondary: 'border border-line bg-surface text-ink hover:bg-surface-muted',
  ghost: 'text-wine-700 hover:bg-wine-50',
  danger: 'bg-danger text-white hover:opacity-90 active:opacity-80',
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  icon?: LucideIcon;
  fullWidth?: boolean;
}

export function Button({
  variant = 'primary',
  icon: Icon,
  fullWidth = false,
  className = '',
  type = 'button',
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-xl px-5 font-semibold transition-colors disabled:opacity-50 ${variantClasses[variant]} ${fullWidth ? 'w-full' : ''} ${className}`}
      {...rest}
    >
      {Icon ? <Icon size={20} aria-hidden="true" /> : null}
      {children}
    </button>
  );
}
