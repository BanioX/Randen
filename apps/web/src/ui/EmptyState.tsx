import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  /** One sentence: what will stand here, and how it gets here. */
  text: string;
  /** The one action that fills the list, e.g. `<ButtonLink to=…>`. */
  action?: ReactNode | undefined;
  /** `card` gives it the white surface of a list; `plain` sits inside a card that is there. */
  variant?: 'card' | 'plain' | undefined;
}

/** What a list shows before its first entry: calm, with the way forward. */
export function EmptyState({ icon: Icon, title, text, action, variant = 'card' }: EmptyStateProps) {
  return (
    <div
      className={`flex flex-col items-center px-6 py-10 text-center ${
        variant === 'card' ? 'rounded-2xl bg-surface shadow-card' : ''
      }`}
    >
      <span className="flex size-14 items-center justify-center rounded-2xl bg-surface-muted text-ink-muted">
        <Icon size={28} strokeWidth={1.5} aria-hidden="true" />
      </span>
      <p className="mt-4 text-lg font-semibold">{title}</p>
      <p className="mt-1 max-w-sm text-ink-muted">{text}</p>
      {action === undefined ? null : <div className="mt-5">{action}</div>}
    </div>
  );
}
