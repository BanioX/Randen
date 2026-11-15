import { useEffect, type RefObject } from 'react';

const TEXT_INPUTS =
  'input:not([type="radio"]):not([type="checkbox"]):not([type="date"]):not([type="search"]),textarea';

/**
 * Tells the on-screen keyboard what Enter does in the fields below `ref` (ADR-0013): a form that
 * ends with «Sichern» says «done», a list of entries says «next». The fields of the kit do not
 * set it themselves, so it is set on what they render, after every render.
 */
export function useEnterKeyHint(ref: RefObject<HTMLElement | null>, hint: 'next' | 'done'): void {
  useEffect(() => {
    for (const input of ref.current?.querySelectorAll(TEXT_INPUTS) ?? []) {
      if (input.getAttribute('enterkeyhint') !== hint) {
        input.setAttribute('enterkeyhint', hint);
      }
    }
  });
}
