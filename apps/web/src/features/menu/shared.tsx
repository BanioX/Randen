import { useState } from 'react';
import { menuMessages } from './messages';

const t = menuMessages;

/**
 * The result of a live query, kept while the next one loads: a list that changes under a
 * person's finger shows its last state instead of flashing empty.
 */
export function useLast<TData>(data: TData | undefined): TData | undefined {
  const [last, setLast] = useState(data);
  if (data !== undefined && data !== last) {
    setLast(data);
  }
  return data ?? last;
}

/** The open points of a dish in one line: «Preis fehlt · Foto fehlt». */
export function problemLine(problems: readonly string[]): string {
  return problems.join(' · ');
}

/** «3 Abschnitte · 14 Gerichte» for a card in a list. */
export function countsLine(sections: number, dishes: number): string {
  return `${t.count.sections(sections)} · ${t.count.dishes(dishes)}`;
}
