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

/**
 * Saves a text as a file the person keeps («Als Datei sichern»): a Blob link that is clicked
 * once and released again. Only the file leaves the page, nothing is sent anywhere.
 */
export function saveTextFile(fileName: string, text: string, type: string): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 1000);
}
