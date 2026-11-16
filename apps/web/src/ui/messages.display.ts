/**
 * Texts of the display components of the UI kit (lists, badges, feedback, charts), in German
 * (Switzerland): «ss» instead of «ß», one person addressed with «du», calm and exact.
 * `messages.display.test.ts` checks them like every other catalog.
 */
export const displayMessages = {
  close: 'Schliessen',
  cancel: 'Abbrechen',
  confirm: 'Bestätigen',
  undo: 'Rückgängig',
  expiry: {
    /** Read out in front of the chip, so «heute» is never heard without its subject. */
    kind: { best_before: 'Mindesthaltbarkeit', use_by: 'Verbrauchsdatum' },
    expired: (since: string) => `abgelaufen ${since}`,
    pastBestBefore: (since: string) => `MHD überschritten ${since}`,
  },
  allergens: {
    label: 'Allergene',
    traces: (name: string) => `Spuren: ${name}`,
  },
  margin: {
    foodCost: (share: string) => `${share} Wareneinsatz`,
    unknown: 'Preis fehlt',
    status: { good: 'im Ziel', watch: 'knapp über dem Ziel', over: 'über dem Ziel' },
  },
  temperature: {
    ok: 'im Bereich',
    off: 'ausserhalb des Bereichs',
  },
  /** What a key figure says about its tone when the page gives no words of its own. */
  tone: {
    ok: 'In Ordnung',
    soon: 'Im Blick behalten',
    today: 'Heute zu tun',
    danger: 'Prüfen',
    neutral: 'Ohne Wertung',
  },
  photo: { missing: 'Kein Foto' },
  table: { empty: 'Noch keine Einträge.' },
  chart: {
    empty: 'Noch keine Daten',
    tableCaption: (value: string, category: string) => `Daten: ${value} nach ${category}`,
    target: 'Ziel',
    other: 'Übrige',
    share: 'Anteil',
    marker: 'Heute',
  },
} as const;
