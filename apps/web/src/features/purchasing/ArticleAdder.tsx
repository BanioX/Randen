import type { ArticleRef, Id } from '@randen/core';
import { useRef, useState, type FocusEvent, type KeyboardEvent, type MouseEvent } from 'react';
import { ArticlePicker } from '../../ui/pickers';

interface ArticleAdderProps {
  label: string;
  hint?: string | undefined;
  /** Only bought goods by default: what is made in house is not bought. */
  filter?: ((article: ArticleRef) => boolean) | undefined;
  onAdd: (articleId: Id, article: ArticleRef | null) => void;
}

const bought = (article: ArticleRef) => article.kind === 'purchased';

/**
 * The article of the next line. A line is added only when the person takes an entry (a tap,
 * Enter, or leaving the field with a name typed in full), never while typing: «Rahm» must not
 * become a line on the way to «Rahmquark». Afterwards the field is empty for the next one.
 */
export function ArticleAdder({ label, hint, filter = bought, onAdd }: ArticleAdderProps) {
  const [round, setRound] = useState(0);
  const [chosen, setChosen] = useState<Id | null>(null);
  /** The same as `chosen`, readable in the event that follows the choice at once. */
  const pending = useRef<{ id: Id; article: ArticleRef | null } | null>(null);

  function take() {
    const taken = pending.current;
    if (taken === null) {
      return;
    }
    pending.current = null;
    setChosen(null);
    setRound((current) => current + 1);
    onAdd(taken.id, taken.article);
  }

  return (
    <div
      onClick={(event: MouseEvent<HTMLDivElement>) => {
        if (event.target instanceof Element && event.target.closest('[role="option"]') !== null) {
          take();
        }
      }}
      onKeyDown={(event: KeyboardEvent<HTMLDivElement>) => {
        if (event.key === 'Enter' && pending.current !== null) {
          event.preventDefault();
          take();
        }
      }}
      onBlur={(event: FocusEvent<HTMLDivElement>) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          take();
        }
      }}
    >
      <ArticlePicker
        key={round}
        label={label}
        hint={hint}
        value={chosen}
        filter={filter}
        onChange={(id, article) => {
          pending.current = id === null ? null : { id, article };
          setChosen(id);
        }}
      />
    </div>
  );
}
