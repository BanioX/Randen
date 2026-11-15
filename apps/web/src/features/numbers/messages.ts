/**
 * Texts of «Zahlen» (de-CH, «ss», «du»): the money side of the kitchen. Calm and exact; numbers
 * arrive formatted (`useMoney`, `formatPercent`), so a sentence never shows a raw figure.
 */

const count = (n: number, one: string, many: string) => (n === 1 ? `1 ${one}` : `${n} ${many}`);

export const numbersMessages = {
  title: 'Zahlen',
  back: 'Zahlen',
  today: (date: string) => `Stand ${date}`,
  period: {
    label: 'Zeitraum',
    week: '7 Tage',
    days: '30 Tage',
    month: 'Monat',
  },
  /** The one dark card: the cost of goods in percent against the target. */
  foodCost: {
    label: 'Wareneinsatz',
    open: 'Offen',
    above: (points: string, target: string) => `${points} Punkte über dem Ziel von ${target}`,
    below: (points: string, target: string) => `${points} Punkte unter dem Ziel von ${target}`,
    on: (target: string) => `Im Ziel von ${target}`,
    none: 'Ohne Umsatz noch kein Wareneinsatz in Prozent.',
  },
  tiles: {
    net: 'Umsatz netto',
    purchases: 'Einkauf',
    waste: 'Abschreiber',
    stock: 'Lagerwert',
    budgetLeft: 'Budget übrig',
    noBudget: 'Kein Budget',
    noComparison: 'Ohne Vergleich',
    change: (percent: string) => `${percent} gegenüber der Vorperiode`,
    same: 'Wie in der Vorperiode',
    articles: (n: number) => count(n, 'Artikel mit Bestand', 'Artikel mit Bestand'),
  },
  budget: {
    title: (month: string) => `Budget ${month}`,
    label: 'Einkauf gegen Budget',
    of: (spent: string, budget: string) => `${spent} von ${budget}`,
    summary: (spent: string, passed: string) => `${spent} ausgegeben, ${passed} des Monats vorbei`,
    marker: (day: number, days: number) => `Heute, Tag ${day} von ${days}`,
    projection: (amount: string) => `Prognose am Monatsende: ${amount}`,
    none: 'Noch kein Budget für diesen Monat.',
    add: 'Budget festlegen',
    status: {
      on_track: 'Im Rahmen',
      tight: 'Knapp: die Prognose liegt bis 10 % über dem Budget',
      over: 'Über dem Budget',
    },
  },
  chart: {
    title: 'Umsatz netto und Wareneinsatz pro Tag',
    summary: (net: string, cost: string) =>
      `Umsatz netto ${net}, Wareneinsatz ${cost} in diesem Zeitraum.`,
    category: 'Tag',
    value: 'Betrag',
    net: 'Umsatz netto',
    cost: 'Wareneinsatz',
  },
  notices: {
    noSales: (days: number) =>
      `${count(days, 'Tag ohne Verkaufseintrag', 'Tage ohne Verkaufseintrag')}. Der Umsatz ist darum zu niedrig.`,
    noSalesAction: 'Verkäufe erfassen',
    consumption: (amount: string) => `Ware für ${amount} wurde ohne Verkauf verbraucht.`,
    dishes: (n: number) =>
      `${count(n, 'Gericht ohne Kosten', 'Gerichte ohne Kosten')}: Preis fehlt. Deren Wareneinsatz fehlt darum.`,
    dishesAction: 'Rezepte prüfen',
    incomplete: 'Die Zahlen sind unvollständig',
  },
  doors: {
    title: 'Weiter',
    sales: { title: 'Verkäufe erfassen', detail: 'Verkaufte Portionen je Gericht' },
    margins: { title: 'Margen', detail: 'Deckungsbeitrag je Gericht' },
    menuEngineering: { title: 'Menu-Engineering', detail: 'Welche Gerichte sich lohnen' },
    budget: { title: 'Budget', detail: 'Einkaufsbudget und sechs Monate' },
    breakEven: { title: 'Break-even', detail: 'Ab wann die Küche Geld verdient' },
    waste: { title: 'Abschreiber', detail: 'Nach Art und Grund, in Franken und Kilo' },
    report: { title: 'Monatsbericht', detail: 'Zum Drucken, auf zwei Seiten' },
  },
  essentials: {
    title: 'Der Monat in Kürze',
  },
  empty: {
    title: 'Noch keine Zahlen',
    text: 'Mit dem ersten Wareneingang und dem ersten Verkauf zeigt Randen Einkauf und Wareneinsatz.',
    action: 'Wareneingang buchen',
  },
  /** The page of the budget of one month. */
  budgetPage: {
    title: 'Budget',
    previous: 'Vormonat',
    next: 'Nächster Monat',
    form: {
      legend: 'Budget des Monats',
      budget: 'Einkaufsbudget',
      budgetHint: 'Wie viel der Betrieb diesen Monat höchstens einkaufen will.',
      revenue: 'Umsatzziel',
      revenueHint: 'Der Umsatz, mit dem der Monat plant. Nur zum Vergleichen.',
      target: 'Ziel Wareneinsatz',
      targetHint: 'Der Anteil am Umsatz, den die Ware höchstens kosten darf.',
      fixed: 'Fixkosten',
      fixedHint: 'Was der Monat kostet, ob Gäste kommen oder nicht: Miete, Löhne, Energie.',
      proposal: (month: string) => `Vorschlag aus ${month}. Prüf die Werte und sichere sie.`,
      save: 'Budget sichern',
      saved: (month: string) => `Budget für ${month} gesichert.`,
    },
    suppliers: {
      title: 'Einkauf nach Lieferant',
      caption: 'Einkauf nach Lieferant',
      supplier: 'Lieferant',
      without: 'Ohne Lieferant',
      empty: 'Noch kein Einkauf in diesem Monat.',
    },
    categories: {
      title: 'Einkauf nach Warengruppe',
      caption: 'Einkauf nach Warengruppe',
      category: 'Warengruppe',
    },
    amount: 'Betrag',
    history: {
      title: 'Die letzten sechs Monate',
      caption: 'Budget, Einkauf und Wareneinsatz der letzten sechs Monate',
      month: 'Monat',
      budget: 'Budget',
      purchases: 'Einkauf',
      net: 'Umsatz netto',
      foodCost: 'Wareneinsatz',
      open: (month: string) => `Budget ${month} öffnen`,
    },
  },
  /** The break-even of the month. */
  breakEvenPage: {
    title: 'Break-even',
    answerReached: (day: string) => `Erreicht am ${day}.`,
    answerOpen: (rest: string, breakEven: string) =>
      `Ab ${breakEven} Umsatz im Monat verdient die Küche Geld. Es fehlen noch ${rest}.`,
    answerDone: (breakEven: string) => `Ab ${breakEven} Umsatz im Monat verdient die Küche Geld.`,
    answerNone: 'Noch kein Break-even. Trag unten die Fixkosten des Monats ein.',
    answerNoRevenue: 'Noch kein Umsatz im Monat. Ab dann rechnet Randen den Break-even.',
    answerNoContribution:
      'Die Ware kostet bisher mehr als der Umsatz. Ohne Deckungsbeitrag gibt es keinen Break-even.',
    bar: {
      label: 'Umsatz bis heute',
      summary: 'Umsatz netto bis heute, bis zum Break-even des Monats',
      of: (today: string, breakEven: string) => `${today} von ${breakEven}`,
    },
    figures: {
      fixed: 'Fixkosten',
      fixedHint: 'Im Monat, fest',
      contribution: 'Deckungsbeitrag',
      contributionHint: (percent: string) => `${percent} vom Umsatz bleiben nach der Ware`,
      revenue: 'Umsatz bisher',
      revenueHint: 'Netto, ohne MWST',
      needed: 'Nötig pro Tag',
      neededHint: (days: number) =>
        `Auf die ${count(days, 'verbleibende Tag', 'verbleibenden Tage')} verteilt`,
      neededDone: 'Erreicht',
      portions: 'Portionen',
      portionsCount: (n: number) => `${n} Portionen`,
      portionsHint: (margin: string) => `bei ${margin} Deckungsbeitrag je Portion`,
      unknown: 'Noch nicht bekannt',
    },
    reasons: {
      no_fixed_costs: 'Fixkosten fehlen',
      no_revenue: 'Noch kein Umsatz',
      no_contribution: 'Die Ware kostet mehr als der Umsatz',
      no_portions: 'Noch kein Gericht mit vollständigen Kosten verkauft',
    },
    explain: {
      title: 'So rechnet Randen',
      text: (contribution: string, fixed: string, breakEven: string) =>
        `Vom Umsatz bleibt nach dem Wareneinsatz der Deckungsbeitrag von ${contribution}. Der Break-even ist der Umsatz, bei dem dieser Anteil die Fixkosten von ${fixed} deckt: ${breakEven}. Gerechnet wird mit dem Stand von heute und dem Anteil, den die Ware bis jetzt hat.`,
    },
    form: {
      legend: 'Fixkosten dieses Monats',
      fixed: 'Fixkosten',
      fixedHint: 'Miete, Löhne und Energie des Monats. Sie stehen auch im Budget des Monats.',
      budget: 'Einkaufsbudget',
      budgetHint: 'Braucht der Monat noch ein Budget, damit die Fixkosten gespeichert werden.',
      save: 'Fixkosten sichern',
      saved: 'Fixkosten gesichert.',
    },
    empty: {
      title: 'Noch keine Fixkosten',
      text: 'Trag die Fixkosten des Monats ein: Miete, Löhne, Energie. Dann rechnet Randen aus, ab wann die Küche Geld verdient.',
    },
  },
  /** The write-offs of a period. */
  wastePage: {
    title: 'Abschreiber',
    lead: (total: string, share: string | undefined) =>
      share === undefined
        ? `Abschreiber: ${total} in diesem Zeitraum.`
        : `Abschreiber: ${total} in diesem Zeitraum, ${share} der Einkäufe.`,
    total: 'Abschreiber',
    weight: 'Gewicht',
    change: (percent: string) => `${percent} gegenüber der Vorperiode`,
    noChange: 'Ohne Vergleich',
    byKind: {
      title: 'Abschreiber nach Art',
      summary: (largest: string, amount: string) => `${largest} ist mit ${amount} die grösste Art.`,
    },
    byReason: {
      title: 'Abschreiber nach Grund',
      summary: (largest: string, amount: string) =>
        `${largest} mit ${amount} ist der häufigste Grund.`,
    },
    byWeekday: {
      title: 'Abschreiber nach Wochentag',
      summary: (day: string, amount: string) => `Am ${day} fällt am meisten an: ${amount}.`,
    },
    top: {
      title: 'Die zehn Artikel mit dem höchsten Abschreiber',
      caption: 'Die zehn Artikel mit dem höchsten Abschreiber',
      article: 'Artikel',
      quantity: 'Menge',
      amount: 'Betrag',
      empty: 'Keine Abschreiber in diesem Zeitraum.',
    },
    journal: 'Im Journal nachsehen',
    none: 'Keine Abschreiber in diesem Zeitraum.',
    weekdays: ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'],
    category: 'Art',
    value: 'Betrag',
  },
  /** The month report, printed. */
  report: {
    title: 'Monatsbericht',
    print: 'Drucken',
    printedOn: (date: string) => `Gedruckt am ${date}`,
    heading: (month: string) => `Monatsbericht ${month}`,
    sections: {
      costs: 'Wareneinsatz und Umsatz',
      budget: 'Einkauf gegen Budget',
      waste: 'Abschreiber',
      count: 'Inventur',
      stock: 'Lagerwert',
      breakEven: 'Break-even',
      dishes: 'Die besten und die schwächsten Gerichte',
      meals: 'Wareneinsatz pro Mahlzeit',
      gaps: 'Lücken in den Zahlen',
    },
    rows: {
      net: 'Umsatz netto',
      gross: 'Umsatz brutto',
      goods: 'Wareneinsatz',
      foodCost: 'Wareneinsatz in Prozent',
      target: 'Ziel',
      purchases: 'Einkauf',
      budget: 'Budget',
      left: 'Übrig',
      over: 'Über dem Budget',
      kind: 'Art',
      reason: 'Grund',
      amount: 'Betrag',
      weight: 'Gewicht',
      total: 'Total',
      lost: 'Fehlt laut Inventur',
      gained: 'Mehr laut Inventur',
      none: 'Keine Differenz',
      stock: 'Lagerwert am Monatsende',
      fixed: 'Fixkosten',
      breakEven: 'Break-even',
      reached: 'Erreicht',
      missing: 'Es fehlen',
      contribution: 'Deckungsbeitrag',
      best: 'Stärkste',
      weakest: 'Schwächste',
      dish: 'Gericht',
      portions: 'Portionen',
      contributionAmount: 'Deckungsbeitrag',
      perMeal: 'Wareneinsatz je Mahlzeit',
      targetPerMeal: 'Ziel je Mahlzeit',
      meals: 'Mahlzeiten',
      plate: 'Tellerrücklauf',
      plateValue: 'Wert des Tellerrücklaufs',
      notSet: 'Ziel nicht gesetzt',
    },
    emptyDishes: 'Noch keine Gerichte mit vollständigen Kosten verkauft.',
    noMeals: 'Keine Mahlzeiten gezählt.',
    gaps: {
      sales: (days: number) =>
        `${count(days, 'Tag ohne Verkaufseintrag', 'Tage ohne Verkaufseintrag')}.`,
      consumption: (amount: string) => `Ware für ${amount} ohne Verkauf verbraucht.`,
      dishes: (n: number) => `${count(n, 'Gericht ohne Kosten', 'Gerichte ohne Kosten')}.`,
      none: 'Keine Lücken.',
    },
    back: 'Zahlen',
  },
  /** Every change of the month: pointing at what it means. */
  change: {
    up: 'mehr',
    down: 'weniger',
    same: 'gleich',
  },
  toasts: {
    saved: 'Gesichert',
  },
  errorTitle: 'Die Zahlen konnten nicht geladen werden.',
} as const;

export type NumbersMessages = typeof numbersMessages;
