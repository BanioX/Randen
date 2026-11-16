/**
 * Semantic tones of the design system (docs/design.md). One meaning per colour, and colour never
 * carries a meaning alone: whatever wears a tone also says it in words or with an icon.
 *
 * `ok` in order · `soon` soon, watch · `today` due today · `danger` wrong, expired, written off ·
 * `cold` `frozen` `dry` `bar` the storage areas · `grape` the mark on Traube («Beste Marge») ·
 * `wine` chosen or tappable · `neutral` everything else.
 */
export type Tone =
  | 'ok'
  | 'soon'
  | 'today'
  | 'danger'
  | 'cold'
  | 'frozen'
  | 'dry'
  | 'bar'
  | 'grape'
  | 'neutral'
  | 'wine';

export interface ToneClasses {
  /** Tinted background with its text: chips, badges, icon tiles. */
  chip: string;
  /** Background of a small dot or a thin bar that stands beside text. */
  dot: string;
  /** Full fill with readable text on it. */
  solid: string;
  /** The tone as text on a card or on the ground. */
  text: string;
}

/* Every pair below is proven by `pnpm contrast` in light and dark. */
export const toneClasses: Record<Tone, ToneClasses> = {
  ok: {
    chip: 'bg-ok-bg text-ok',
    dot: 'bg-ok',
    solid: 'bg-ok text-white',
    text: 'text-ok',
  },
  soon: {
    chip: 'bg-soon-bg text-soon',
    dot: 'bg-soon',
    solid: 'bg-soon text-surface',
    text: 'text-soon',
  },
  // Due today, not wrong yet: the wine accent, never an alarm colour and never a red edge.
  today: {
    chip: 'bg-today-bg text-today',
    dot: 'bg-today',
    solid: 'bg-today text-white',
    text: 'text-today',
  },
  // What is wrong (expired, out of range, over the target): vermilion text on a light vermilion
  // tint with a fine edge and a warning symbol, so it never reads as «heute».
  danger: {
    chip: 'border border-danger/40 bg-danger-bg text-danger',
    dot: 'bg-danger',
    solid: 'bg-danger text-white',
    text: 'text-danger',
  },
  cold: {
    chip: 'bg-cold-bg text-cold',
    dot: 'bg-cold',
    solid: 'bg-cold text-surface',
    text: 'text-cold',
  },
  frozen: {
    chip: 'bg-frozen-bg text-frozen',
    dot: 'bg-frozen',
    solid: 'bg-frozen text-surface',
    text: 'text-frozen',
  },
  dry: {
    chip: 'bg-dry-bg text-dry',
    dot: 'bg-dry',
    solid: 'bg-dry text-surface',
    text: 'text-dry',
  },
  bar: {
    chip: 'bg-bar-bg text-bar',
    dot: 'bg-bar',
    solid: 'bg-bar text-surface',
    text: 'text-bar',
  },
  // Kork on Traube: the one mark that may look like the dark card.
  grape: {
    chip: 'bg-grape text-cork',
    dot: 'bg-grape',
    solid: 'bg-grape text-cork',
    text: 'text-wine-900',
  },
  neutral: {
    chip: 'bg-surface-muted text-ink-muted',
    dot: 'bg-line-strong',
    solid: 'bg-ink-muted text-surface',
    text: 'text-ink-muted',
  },
  wine: {
    chip: 'bg-wine-100 text-wine-800',
    dot: 'bg-wine-700',
    solid: 'bg-wine-700 text-white',
    text: 'text-wine-800',
  },
};
