import { useEffect, useState, type RefObject } from 'react';

/**
 * The last result of a live query. While a query runs again with new filters it has no data for
 * a moment; keeping the list that was there stops the page from flickering under the fingers.
 */
export function useKept<TValue>(value: TValue | undefined): TValue | undefined {
  const [kept, setKept] = useState(value);
  if (value !== undefined && value !== kept) {
    setKept(value);
  }
  return value ?? kept;
}

/** What the Enter key of the on-screen keyboard says: it moves on, or it finishes the form. */
export type EnterKeyHint = 'next' | 'done';

const TEXT_INPUTS =
  'input:not([type="radio"]):not([type="checkbox"]):not([type="date"]):not([type="search"])';

/**
 * Tells the on-screen keyboard what Enter does in every text field below `ref` (ADR-0013). The
 * fields of the UI kit do not take the attribute themselves, so it is set on what they render.
 */
export function useEnterKeyHint(ref: RefObject<HTMLElement | null>, hint: EnterKeyHint): void {
  // After every render: lines come and go, and each new field needs the hint.
  useEffect(() => {
    for (const input of ref.current?.querySelectorAll(TEXT_INPUTS) ?? []) {
      if (input.getAttribute('enterkeyhint') !== hint) {
        input.setAttribute('enterkeyhint', hint);
      }
    }
  });
}

/** Moves the focus to the element with this id once it is in the page, and selects its text. */
export function useFocusOn(targetId: string | null, onDone: () => void): void {
  useEffect(() => {
    if (targetId === null) {
      return;
    }
    const element = document.getElementById(targetId);
    if (element instanceof HTMLElement) {
      element.focus({ preventScroll: true });
      if (element instanceof HTMLInputElement) {
        element.select();
      }
      // Into the middle of the screen: at its edge the field would lie under the bar with the
      // main button, which sticks to the bottom on the phone. (Tests have no layout to scroll.)
      if (typeof element.scrollIntoView === 'function') {
        element.scrollIntoView({ block: 'center' });
      }
    }
    onDone();
  }, [targetId, onDone]);
}
