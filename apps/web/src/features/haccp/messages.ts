/**
 * Texts of «Selbstkontrolle» (de-CH, «ss», «du»): today, the temperatures with their history, the
 * cleaning plan and the report for the food inspector. Calm and exact; the numbers arrive
 * formatted (docs/regeln.md B). Limits are «Richtwert»; the app is a help, not a proof (ADR-0012).
 */

const tasks = (count: number) => (count === 1 ? '1 Aufgabe' : `${String(count)} Aufgaben`);
const measurements = (count: number) => (count === 1 ? '1 Messung' : `${String(count)} Messungen`);
const days = (count: number) => (count === 1 ? '1 Tag' : `${String(count)} Tage`);

export const haccpMessages = {
  title: 'Selbstkontrolle',
  back: 'Selbstkontrolle',
  subtitle: 'Was heute zu messen und zu erledigen ist.',
  nothing: 'Nichts',
  unknownPerson: 'Unbekannt',

  weekdays: {
    mon: 'Montag',
    tue: 'Dienstag',
    wed: 'Mittwoch',
    thu: 'Donnerstag',
    fri: 'Freitag',
    sat: 'Samstag',
    sun: 'Sonntag',
  },
  weekdayShort: { mon: 'Mo', tue: 'Di', wed: 'Mi', thu: 'Do', fri: 'Fr', sat: 'Sa', sun: 'So' },

  kinds: {
    storage: 'Lagerung',
    receiving: 'Wareneingang',
    cooking: 'Kerntemperatur',
    hot_holding: 'Heisshalten',
    cooling: 'Abkühlen',
  },
  frequencies: { daily: 'Täglich', weekly: 'Wöchentlich', monthly: 'Monatlich' },

  results: {
    ok: 'im Bereich',
    out: 'ausserhalb',
    noLimit: 'ohne Bereich',
  },

  today: {
    temperatures: 'Temperaturen heute',
    tasks: 'Aufgaben heute',
    food: 'Lebensmittel heute',
    noAreas: 'Noch kein Lagerbereich mit Temperaturbereich. Lege einen unter «Wo ist was?» an.',
    notYet: 'Heute noch nicht gemessen',
    lastReading: (time: string, who: string) => `gemessen ${time}, ${who}`,
    field: (area: string) => `Temperatur in ${area}`,
    fieldHint: (range: string) => `Bereich ${range}`,
    record: 'Erfassen',
    recorded: (area: string, value: string) => `${area}: ${value} erfasst`,
    recordedOut: (area: string, value: string) => `${area}: ${value} ausserhalb, festgehalten`,
    noTasks: 'Heute ist nichts im Reinigungsplan fällig.',
    tasksDone: (done: number, due: number) => `${String(done)} von ${String(due)} erledigt`,
    doneBy: (time: string, who: string) => `erledigt ${time}, ${who}`,
    checked: (name: string) => `${name} erledigt`,
    unchecked: (name: string) => `${name} wieder offen`,
    undo: 'Rückgängig',
    measureFood: 'Lebensmittel messen',
    foodEmpty: 'Heute noch keine Kerntemperatur, kein Heisshalten, keine Abkühlung.',
    offer: {
      title: 'Noch kein Reinigungsplan',
      text: 'Der übliche Plan für eine Küche zeigt, was täglich, wöchentlich und monatlich zu tun ist. Du passt ihn an.',
      action: 'Reinigungsplan mit üblichen Aufgaben anlegen',
      done: (count: number) =>
        `Reinigungsplan angelegt: ${tasks(count)}. Du kannst jede Aufgabe ändern.`,
    },
    open: (areas: string) => `Heute noch nicht gemessen: ${areas}`,
    outOfRange: (count: number) =>
      `${measurements(count)} in den letzten 7 Tagen ausserhalb des Bereichs. Sie stehen im Verlauf.`,
    links: {
      history: 'Verlauf der Temperaturen',
      plan: 'Reinigungsplan',
      report: 'Bericht für die Kontrolle',
    },
  },

  action: {
    title: 'Was hast du getan?',
    text: (value: string, range: string) =>
      `${value} liegt ausserhalb des Bereichs ${range}. Schreib kurz, was du dagegen getan hast.`,
    label: 'Massnahme',
    hint: 'Zum Beispiel: Tür geschlossen, Ware umgelagert, Gerät neu eingestellt.',
    save: 'Messung sichern',
    cancel: 'Abbrechen',
  },

  temperatures: {
    title: 'Verlauf der Temperaturen',
    record: 'Messen',
    kind: 'Art der Messung',
    area: 'Lagerbereich',
    label: 'Was wird gemessen',
    labelHint: 'Zum Beispiel: Pouletbrust, Kern; Suppe im Bain-Marie.',
    temperature: 'Temperatur',
    proposal: (text: string) => `Richtwert: ${text}`,
    proposalSource: (source: string) => `Quelle: ${source}`,
    recordSave: 'Messung sichern',
    recordDone: (value: string, result: string) => `${value} gemessen, ${result}`,
    history: 'Verlauf',
    period: 'Zeitraum',
    periods: { week: '7 Tage', month: '30 Tage' },
    empty: 'Noch keine Messung in diesem Zeitraum.',
    chart: {
      day: 'Tag',
      title: (area: string) => `Temperaturen ${area}`,
      summary: (area: string, range: string) =>
        `Je Tag der wärmste und der kälteste Wert in ${area}, Bereich ${range}.`,
      warmest: 'Wärmster Wert',
      coolest: 'Kältester Wert',
      noRange: 'ohne Bereich',
    },
    table: {
      caption: 'Messungen',
      when: 'Wann',
      what: 'Was',
      value: 'Wert',
      range: 'Bereich',
      result: 'Ergebnis',
      action: 'Massnahme',
      who: 'Wer',
    },
    detail: {
      title: 'Messung',
      facts: {
        when: 'Wann',
        what: 'Was',
        value: 'Wert',
        range: 'Bereich',
        result: 'Ergebnis',
        action: 'Massnahme',
        who: 'Wer',
      },
      remove: 'Messung löschen',
      removeTitle: 'Messung löschen?',
      removeText: (what: string) =>
        `${what} verschwindet aus dem Verlauf und aus dem Bericht. Das geht nur am selben Tag.`,
      cancel: 'Behalten',
      removed: 'Messung gelöscht',
      notRemovable: 'Diese Messung ist von einem früheren Tag und bleibt im Verlauf.',
    },
    proposals: {
      cooking: 'Garen und Regenerieren',
      hot_holding: 'Warmhalten',
      cooling: 'Abkühlen',
    },
    series: 'Tagesreihe',
  },

  plan: {
    title: 'Reinigungsplan',
    add: 'Aufgabe hinzufügen',
    empty: {
      title: 'Noch kein Reinigungsplan',
      text: 'Lege die Aufgaben an, die in deiner Küche anfallen. Jede Aufgabe ist täglich, wöchentlich oder monatlich fällig.',
      standard: 'Mit üblichen Aufgaben anlegen',
    },
    lastDone: (date: string, who: string) => `zuletzt ${date}, ${who}`,
    neverDone: 'noch nie erledigt',
    paused: 'pausiert',
    sheet: {
      createTitle: 'Aufgabe hinzufügen',
      editTitle: 'Aufgabe bearbeiten',
      name: 'Aufgabe',
      area: 'Lagerbereich',
      frequency: 'Rhythmus',
      weekday: 'Wochentag',
      instructions: 'Anleitung',
      instructionsHint: 'Was genau zu tun ist, wie es gemacht wird.',
      active: 'Aufgabe ist aktiv',
      activeHint: 'Pausierte Aufgaben bleiben im Plan, sind aber nicht fällig.',
      save: 'Sichern',
      cancel: 'Abbrechen',
      remove: 'Aufgabe löschen',
      removeTitle: 'Aufgabe löschen?',
      removeText: (name: string) =>
        `${name} verschwindet aus dem Plan. Was schon abgehakt ist, bleibt im Bericht.`,
      keep: 'Behalten',
      saved: (name: string) => `${name} gesichert`,
      removed: (name: string) => `${name} gelöscht`,
      weekdayMissing: 'Für eine wöchentliche Aufgabe gehört ein Wochentag dazu.',
      noArea: 'Ohne Lagerbereich',
    },
  },

  report: {
    title: 'Bericht für die Kontrolle',
    print: 'Drucken',
    periodLegend: 'Zeitraum',
    periods: {
      thisWeek: 'Diese Woche',
      lastWeek: 'Letzte Woche',
      thisMonth: 'Dieser Monat',
      lastMonth: 'Letzter Monat',
    },
    period: (from: string, to: string) => `${from} bis ${to}`,
    disclaimer:
      'Dieser Bericht belegt die Selbstkontrolle des Betriebs. Er ersetzt weder das Selbstkontrollkonzept noch die Auskunft einer fachkundigen Person.',
    summary: (measured: number, out: number, missing: number) =>
      `${measurements(measured)}, ${String(out)} ausserhalb des Bereichs, ${days(missing)} ohne Messung.`,
    summaryTasks: (done: number, due: number) =>
      `Reinigung: ${String(done)} von ${String(due)} erledigt.`,
    summaryReceipts: (count: number, notOk: number) =>
      count === 0
        ? 'Kein Wareneingang in diesem Zeitraum.'
        : `${count === 1 ? '1 Wareneingang' : `${String(count)} Wareneingänge`}, ${String(notOk)} nicht in Ordnung.`,
    business: 'Betrieb',
    printedOn: (date: string) => `Stand ${date}`,
    storage: {
      title: 'Lagerung je Tag',
      day: 'Tag',
      empty: 'Keine Lagerbereiche mit Temperatur.',
      range: (min: string, max: string) => `${min} bis ${max}`,
      out: (count: number) => `${String(count)} ausserhalb`,
      none: '–',
    },
    deviations: {
      title: 'Abweichungen',
      empty: 'Keine Abweichung in diesem Zeitraum.',
      row: (when: string, what: string, value: string) => `${when}, ${what}, ${value}`,
      action: (action: string) => `Massnahme: ${action}`,
      noAction: 'Keine Massnahme festgehalten',
    },
    food: {
      title: 'Lebensmittel',
      empty: 'Keine Messung von Lebensmitteln in diesem Zeitraum.',
      limitTitle: 'Richtwert',
      limit: (text: string) => `Richtwert ${text}`,
    },
    tasks: {
      title: 'Reinigung',
      empty: 'Keine Aufgabe im Plan.',
      due: (count: number, done: number) => `${String(done)} von ${String(count)}`,
      cell: {
        done: (who: string) => `erledigt, ${who}`,
        open: 'offen',
        notDue: 'nicht fällig',
      },
      monthly: 'monatlich',
    },
    receipts: {
      title: 'Wareneingang',
      empty: 'Kein Wareneingang in diesem Zeitraum.',
      supplier: 'Lieferant',
      document: 'Beleg',
      temperature: 'Temperatur',
      check: 'In Ordnung',
      yes: 'ja',
      no: 'nein',
      by: 'Wer',
    },
    missing: {
      title: 'Tage ohne Messung',
      empty: 'An jedem Tag ist etwas gemessen.',
      text: (days: string) => `Ohne Messung: ${days}.`,
    },
    people: {
      title: 'Wer steht hinter den Initialen',
      line: (initials: string, name: string) => `${initials}: ${name}`,
    },
  },
} as const;
