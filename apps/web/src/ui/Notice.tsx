import { CircleCheck, Clock, Info, TriangleAlert, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

export type NoticeTone = 'info' | 'ok' | 'soon' | 'danger';

interface NoticeProps {
  tone?: NoticeTone | undefined;
  /** The fact in a few words. */
  title?: string | undefined;
  /** What it means and what to do, in one or two sentences. */
  children?: ReactNode | undefined;
  /** Replaces the icon of the tone. */
  icon?: LucideIcon | undefined;
  /** One action, e.g. `<ButtonLink size="sm" variant="secondary" …>`. */
  action?: ReactNode | undefined;
  /** `row` is one compact line inside a card or a form; `card` stands on its own. */
  variant?: 'card' | 'row' | undefined;
}

const looks: Record<NoticeTone, { icon: LucideIcon; surface: string; mark: string }> = {
  info: { icon: Info, surface: 'bg-wine-50', mark: 'text-wine-800' },
  ok: { icon: CircleCheck, surface: 'bg-ok-bg', mark: 'text-ok' },
  soon: { icon: Clock, surface: 'bg-soon-bg', mark: 'text-soon' },
  danger: { icon: TriangleAlert, surface: 'bg-today-bg', mark: 'text-danger' },
};

/**
 * A calm hint: the tone tints the surface and picks the icon, the words carry the meaning.
 * `danger` is announced at once (`role="alert"`), the others politely (`role="status"`).
 */
export function Notice({
  tone = 'info',
  title,
  children,
  icon,
  action,
  variant = 'card',
}: NoticeProps) {
  const look = looks[tone];
  const Icon = icon ?? look.icon;
  const row = variant === 'row';
  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      className={`flex items-start gap-3 text-ink ${look.surface} ${
        row ? 'rounded-xl px-3 py-2.5 text-[0.9375rem]' : 'rounded-2xl p-4'
      }`}
    >
      <Icon
        size={row ? 20 : 22}
        strokeWidth={1.75}
        aria-hidden="true"
        className={`mt-0.5 shrink-0 ${look.mark}`}
      />
      <div className="min-w-0 flex-1 sm:flex sm:items-center sm:justify-between sm:gap-4">
        <div className="min-w-0">
          {title === undefined ? null : <p className="font-semibold">{title}</p>}
          {children === undefined ? null : <div className="break-words">{children}</div>}
        </div>
        {action === undefined ? null : <div className="mt-3 shrink-0 sm:mt-0">{action}</div>}
      </div>
    </div>
  );
}
