/**
 * Texts of the form side of the UI kit (de-CH, «ss», one person addressed with «du»).
 * An error says what is and what to do, without blame and without technical words
 * (docs/regeln.md A.8). `messages.forms.test.ts` checks the catalog.
 */
export const formMessages = {
  optional: 'optional',
  required: 'Hier fehlt eine Angabe.',
  number: {
    unreadable: 'Das ist keine ganze Zahl. Trag zum Beispiel 12 ein.',
    min: (min: string) => `Trag mindestens ${min} ein.`,
    max: (max: string) => `Trag höchstens ${max} ein.`,
  },
  quantity: {
    unreadable: {
      g: 'Diese Menge lässt sich nicht lesen. Trag zum Beispiel 2.5 kg oder 750 g ein.',
      ml: 'Diese Menge lässt sich nicht lesen. Trag zum Beispiel 1.5 l, 2 dl oder 330 ml ein.',
      pcs: 'Diese Menge lässt sich nicht lesen. Trag eine Zahl ein, zum Beispiel 12.',
    },
    zero: 'Trag eine Menge über 0 ein.',
    /** Name of the unit switch next to a quantity, for screen readers. */
    unitOf: (label: string) => `Einheit für ${label}`,
    /** What the app understood, under the field: «= 2.5 kg». */
    parsed: (quantity: string) => `= ${quantity}`,
  },
  money: {
    unreadable: (example: string) =>
      `Dieser Betrag lässt sich nicht lesen. Trag zum Beispiel ${example} ein.`,
    negative: 'Trag einen Betrag ab 0 ein.',
  },
  unitPrice: {
    /** After the label: «Einkaufspreis pro kg». */
    per: (unit: string) => `pro ${unit}`,
    unreadable: (example: string) =>
      `Dieser Preis lässt sich nicht lesen. Trag zum Beispiel ${example} ein.`,
  },
  percent: {
    unreadable: 'Dieser Anteil lässt sich nicht lesen. Trag zum Beispiel 30 oder 8.1 ein.',
    min: (min: string) => `Trag mindestens ${min} ein.`,
    max: (max: string) => `Trag höchstens ${max} ein.`,
  },
  temperature: {
    unreadable: 'Diese Temperatur lässt sich nicht lesen. Trag zum Beispiel 4.5 oder -18 ein.',
    /** The toggle for a minus sign: phone number pads have no minus key. */
    minus: (label: string) => `Minusgrade, ${label}`,
  },
  select: {
    placeholder: 'Bitte wählen',
  },
  date: {
    placeholder: 'TT.MM.JJJJ',
    openCalendar: 'Kalender öffnen',
    presets: 'Schnellwahl',
    unreadable: 'Dieses Datum gibt es nicht. Trag zum Beispiel 20.11.2026 ein.',
    min: (date: string) => `Trag ein Datum ab dem ${date} ein.`,
    max: (date: string) => `Trag ein Datum bis zum ${date} ein.`,
    weekdays: ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'],
    months: [
      'Jan.',
      'Feb.',
      'März',
      'Apr.',
      'Mai',
      'Juni',
      'Juli',
      'Aug.',
      'Sept.',
      'Okt.',
      'Nov.',
      'Dez.',
    ],
    relative: {
      today: 'heute',
      tomorrow: 'morgen',
      yesterday: 'gestern',
      days: (n: number) => `${String(n)} Tagen`,
      weeks: (n: number) => (n === 1 ? '1 Woche' : `${String(n)} Wochen`),
      months: (n: number) => (n === 1 ? '1 Monat' : `${String(n)} Monaten`),
      years: (n: number) => (n === 1 ? '1 Jahr' : `${String(n)} Jahren`),
      future: (amount: string) => `in ${amount}`,
      past: (amount: string) => `vor ${amount}`,
    },
  },
  search: {
    clear: 'Suche leeren',
  },
  allergens: {
    legend: 'Allergene',
  },
  pickers: {
    article: 'Artikel',
    recipe: 'Rezept',
    area: 'Lagerbereich',
    spot: 'Platz',
    supplier: 'Lieferant',
    staff: 'Person',
    category: 'Warengruppe',
    country: 'Herkunft',
    /** The button that opens the list of a search field with choices. */
    showList: (label: string) => `Liste zeigen, ${label}`,
    /** The name of the list under a search field with choices. */
    suggestions: 'Vorschläge',
    noMatch: 'Kein Treffer. Prüfe die Schreibweise.',
    more: (count: number) =>
      count === 1
        ? '1 weiterer Eintrag. Tippe weiter, um die Liste einzugrenzen.'
        : `${String(count)} weitere Einträge. Tippe weiter, um die Liste einzugrenzen.`,
    unknown: 'Das steht nicht in der Liste. Wähle einen Eintrag aus.',
    chosen: 'gewählt',
    inStock: (quantity: string) => `${quantity} an Lager`,
    noStock: 'nichts an Lager',
    component: 'Komponente',
    portions: (count: number) => (count === 1 ? '1 Portion' : `${String(count)} Portionen`),
    noSpot: 'Ohne festen Platz',
    chooseAreaFirst: 'Wähle zuerst einen Lagerbereich.',
    noSpots: 'Dieser Lagerbereich hat noch keine Plätze.',
  },
  photo: {
    take: 'Foto aufnehmen',
    choose: 'Aus Dateien wählen',
    replace: 'Ersetzen',
    remove: 'Entfernen',
    working: 'Das Foto wird verkleinert …',
    failed: 'Dieses Bild lässt sich nicht lesen. Wähle ein anderes Foto.',
    open: (title: string) => `${title} gross anzeigen`,
    close: 'Schliessen',
  },
} as const;
