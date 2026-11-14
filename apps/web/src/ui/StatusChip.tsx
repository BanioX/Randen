import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { toneClasses, type Tone } from './tones';

interface StatusChipProps {
  tone: Tone;
  children: ReactNode;
  /** Decoration in front of the text; the text stays the meaning. */
  icon?: LucideIcon | undefined;
  /** `sm` for a second line of badges under a title. */
  size?: 'md' | 'sm' | undefined;
  /** An outline instead of the tint, for what is weaker than a fact («Spuren»). */
  outline?: boolean | undefined;
}

const sizeClasses = {
  md: 'gap-1 px-2.5 py-1 text-[0.8125rem]',
  sm: 'gap-1 px-2 py-0.5 text-xs',
} as const;

/**
 * A short status in a pill: the text carries the meaning, the tone supports it. It grows with its
 * text and breaks into a second line before it would be cut off.
 */
export function StatusChip({
  tone,
  children,
  icon: Icon,
  size = 'md',
  outline = false,
}: StatusChipProps) {
  const look = outline
    ? `border border-line-strong bg-surface ${toneClasses[tone].text}`
    : toneClasses[tone].chip;
  return (
    <span
      className={`relative inline-flex max-w-full items-center rounded-full leading-4 font-semibold ${sizeClasses[size]} ${look}`}
    >
      {Icon ? (
        <Icon size={size === 'sm' ? 12 : 14} aria-hidden="true" className="shrink-0" />
      ) : null}
      <span className="min-w-0">{children}</span>
    </span>
  );
}
