/**
 * Texts of «Cockpit» (de-CH, «ss», «du»): the first page and the page behind «＋ Erfassen».
 * Calm and exact; numbers arrive formatted (docs/regeln.md B).
 */

const lots = (count: number) => (count === 1 ? '1 Charge' : `${count} Chargen`);
const articles = (count: number) => (count === 1 ? '1 Artikel' : `${count} Artikel`);
const areas = (count: number) => (count === 1 ? '1 Lagerbereich' : `${count} Lagerbereichen`);
const dishes = (count: number) => (count === 1 ? '1 Gericht' : `${count} Gerichte`);
const tasks = (count: number) => (count === 1 ? '1 Aufgabe' : `${count} Aufgaben`);
const orders = (count: number) => (count === 1 ? '1 Bestellung' : `${count} Bestellungen`);
const entries = (count: number) => (count === 1 ? '1 Eintrag' : `${count} Einträge`);
const meals = (count: number) => (count === 1 ? '1 Mahlzeit' : `${count} Mahlzeiten`);

/** «Lachsfilet, Rindsentrecôte und 2 weitere». */
function list(names: readonly string[], count: number): string {
  const shown = names.filter((name) => name !== '');
  const rest = count - shown.length;
  return rest > 0 ? `${shown.join(', ')} und ${rest} weitere` : shown.join(', ');
}

export const cockpitMessages = {
  title: 'Cockpit',
  receive: 'Wareneingang',
  /** The main action of a kitchen that fetches its goods at the market (ADR-0015). */
  purchase: 'Einkauf erfassen',
  lots,
  articles,
  list,
  failed:
    'Das Cockpit lässt sich gerade nicht berechnen. Deine Daten sind auf dem Gerät und unverändert.',

  date: {
    weekdays: ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'],
    months: [
      'Januar',
      'Februar',
      'März',
      'April',
      'Mai',
      'Juni',
      'Juli',
      'August',
      'September',
      'Oktober',
      'November',
      'Dezember',
    ],
  },

  search: {
    label: 'Im Betrieb suchen',
    placeholder: 'Artikel, Rezept, Lieferant oder Platz',
    results: 'Suchergebnisse',
    groups: {
      articles: 'Artikel',
      recipes: 'Rezepte',
      suppliers: 'Lieferanten',
      spots: 'Plätze',
    },
    none: (text: string) => `Nichts passt zu «${text}».`,
    more: (shown: number, total: number) =>
      `${shown} von ${total} Treffern. Ein weiteres Wort grenzt die Suche ein.`,
    inStock: (quantity: string) => `${quantity} an Lager`,
    noStock: 'nichts an Lager',
    component: 'Komponente',
    market: 'Markt',
    articleCount: articles,
  },

  today: {
    title: 'Heute',
    label: 'Was heute zu tun ist',
    allDone: 'Für heute ist alles erledigt.',
    kinds: {
      expired: {
        title: 'Nicht mehr verwenden',
        detail: (count: number) => `${lots(count)} über dem Verbrauchsdatum`,
      },
      due_today: {
        title: 'Läuft heute ab',
        detail: (count: number) => `${lots(count)} heute verwerten`,
      },
      temperature: {
        title: 'Temperatur messen',
        detail: (count: number) =>
          count === 1
            ? '1 Lagerbereich ohne Messung von heute'
            : `${count} Lagerbereiche ohne Messung von heute`,
      },
      hygiene: {
        title: 'Reinigungsplan',
        detail: (count: number) => `${tasks(count)} offen`,
      },
      orders: {
        title: 'Lieferung erwartet',
        detail: (count: number) => `${orders(count)} fällig`,
      },
      plan: {
        title: 'Heute im Menüplan',
        detail: (count: number) => `${dishes(count)} noch nicht produziert`,
      },
      meals: {
        title: 'Mahlzeiten zählen',
        detail: (count: number) =>
          count === 1 ? '1 Mahlzeit ohne Zählung' : `${count} Mahlzeiten ohne Zählung`,
      },
      below_min: {
        title: 'Unter Mindestbestand',
        detail: (count: number) => `${articles(count)} unter Mindestbestand`,
      },
      shopping: {
        title: 'Einkaufsliste',
        detail: (count: number) => `${entries(count)} auf der Liste`,
      },
    },
    /** The same rows in the words of the functions the business uses (ADR-0015). */
    produce: 'Heute produzieren',
    order: 'Bestellen',
    restock: 'Nachkaufen',
    /** «Mittag, 120 erwartet». */
    meal: (slot: string, expected?: number) =>
      expected === undefined ? slot : `${slot}, ${expected} erwartet`,
  },

  figures: {
    stock: 'Lagerwert',
    spread: (articleCount: number, areaCount: number) =>
      `${articles(articleCount)} in ${areas(areaCount)}`,
    emptyStock: 'Noch nichts an Lager',
    withoutPrice: (count: number) => `${lots(count)} ohne Preis`,
    foodCost: (month: string) => `Wareneinsatz ${month}`,
    open: 'offen',
    noRevenue: (month: string) => `Noch kein Umsatz im ${month} erfasst`,
    target: {
      good: (target: string) => `Ziel ${target}, im Ziel`,
      watch: (target: string) => `Ziel ${target}, knapp darüber`,
      over: (target: string) => `Ziel ${target}, darüber`,
    },
    writeOffs: 'Abschreiber diese Woche',
    thrownAway: 'Weggeworfen diesen Monat',
    thrownAwayCount: (count: number, month: string) =>
      count === 0
        ? `Im ${month} nichts abgeschrieben`
        : count === 1
          ? `1 Abschreiber seit dem 1. ${month}`
          : `${count} Abschreiber seit dem 1. ${month}`,
    perMeal: 'Wareneinsatz pro Mahlzeit',
    perMealHint: {
      good: (target: string) => `Ziel ${target}, im Ziel`,
      watch: (target: string) => `Ziel ${target}, knapp darüber`,
      over: (target: string) => `Ziel ${target}, darüber`,
      noTarget: (served: string) => `${served} ausgegeben, noch kein Ziel`,
      noMeals: (month: string) => `Im ${month} noch keine Mahlzeiten gezählt`,
    },
    meals,
    less: (amount: string) => `${amount} weniger als letzte Woche`,
    more: (amount: string) => `${amount} mehr als letzte Woche`,
    same: 'Gleich viel wie letzte Woche',
    noWriteOffs: 'Diese und letzte Woche nichts abgeschrieben',
    dueToday: 'Läuft heute ab',
    worth: (amount: string) => `Wert ${amount}`,
    nothingDue: 'Nichts fällig',
  },

  useUp: {
    title: 'Heute verwerten',
    plan: 'Im Menüplan verwerten',
    expiring: 'Ablauf ansehen',
    label: 'Chargen, die in den nächsten drei Tagen ablaufen',
    summary: (count: number, amount: string) => `${lots(count)} · ${amount}`,
    none: 'In den nächsten drei Tagen läuft nichts ab.',
    more: (count: number) =>
      count === 1 ? '1 weitere Charge läuft bald ab' : `${count} weitere Chargen laufen bald ab`,
  },

  budget: {
    title: (month: string) => `Budget ${month}`,
    label: 'Wareneinkauf',
    of: (spent: string, budget: string) => `${spent} von ${budget}`,
    day: (day: number, days: number) => `Tag ${day} von ${days}`,
    spent: (share: string) => `${share} ausgegeben`,
    over: (amount: string) => `${amount} über dem Budget`,
    summary: (spent: string, month: string) =>
      `${spent} des Budgets ausgegeben, der Monat ist zu ${month} vorbei.`,
    none: (month: string) => `Für ${month} ist noch kein Budget erfasst.`,
    add: 'Budget erfassen',
  },

  waste: {
    title: 'Abschreiber nach Art, 30 Tage',
    category: 'Art',
    value: 'Wert',
    summary: (total: string, kind: string, amount: string) =>
      `In den letzten 30 Tagen ${total} abgeschrieben, am meisten als ${kind} mit ${amount}.`,
    none: 'In den letzten 30 Tagen wurde nichts abgeschrieben.',
  },

  dishes: {
    title: 'Gerichte nach Marge',
    all: 'Alle anzeigen',
    caption: 'Gerichte nach Marge',
    columns: {
      dish: 'Gericht',
      price: 'Preis',
      cost: 'Wareneinsatz',
      margin: 'Deckungsbeitrag',
      status: 'Stand',
    },
    best: 'Beste Marge',
    withoutPrice: (count: number) => `${dishes(count)} ohne Preis`,
    withoutCost: (count: number) =>
      count === 1
        ? '1 Gericht mit einer Zutat ohne Preis'
        : `${count} Gerichte mit Zutaten ohne Preis`,
    incomplete: 'Rezepte ergänzen',
    none: 'Noch kein Gericht mit Preis. Mit dem ersten Rezept rechnet Randen Wareneinsatz und Marge.',
    newRecipe: 'Rezept erfassen',
  },

  setup: {
    title: 'Erste Schritte',
    progress: (done: number, total: number) => `${done} von ${total} erledigt`,
    done: 'erledigt',
    steps: {
      spots: {
        title: 'Plätze einrichten',
        text: 'Regal, Schublade, Fach: damit alle finden, was wo liegt.',
      },
      articles: {
        title: 'Fünf Artikel erfassen',
        text: (count: number) =>
          count === 0 ? 'Was du einkaufst, mit Preis und Lagerort.' : `${count} von 5 erfasst`,
      },
      receipt: {
        title: 'Ersten Wareneingang buchen',
        text: 'Mit dem Lieferschein kommen Chargen, Daten und Preise ins Lager.',
      },
      /** The same step for a kitchen that fetches its goods at the market. */
      purchase: {
        title: 'Ersten Einkauf erfassen',
        text: 'Mit dem Beleg kommen Chargen, Daten und Preise ins Lager.',
      },
      recipe: {
        title: 'Erstes Rezept mit Preis',
        text: 'Randen rechnet Wareneinsatz, Deckungsbeitrag und Allergene.',
      },
      menu: {
        title: 'Speisekarte anlegen',
        text: 'Mit Allergenen und Herkunft aus den Rezepten.',
      },
      temperature: {
        title: 'Erste Temperatur erfassen',
        text: 'Die Selbstkontrolle beginnt mit der Kühlzelle.',
      },
    },
  },

  demo: {
    eyebrow: 'Zum Ausprobieren',
    title: 'Demo-Betrieb laden',
    text: 'Randen füllt sich mit einer eingerichteten Beispielküche, mit Lager, Rezepten, Speisekarte und Zahlen, damit du alles ausprobieren kannst, bevor du deine eigenen Daten erfasst.',
    action: 'Demo-Betrieb laden',
  },

  add: {
    title: 'Erfassen',
    subtitle: 'Buchen, was in der Küche passiert.',
    book: 'Buchen',
    create: 'Neu erfassen',
    rows: {
      receive: { title: 'Wareneingang', text: 'Lieferung annehmen: Chargen, Daten und Preise.' },
      purchase: {
        title: 'Einkauf erfassen',
        text: 'Den Beleg vom Markt buchen: Ware, Preise und Depot.',
      },
      waste: { title: 'Abschreiben', text: 'Ware abschreiben, mit dem Grund.' },
      temperature: {
        title: 'Temperatur',
        text: 'Eine Messung der Selbstkontrolle erfassen.',
      },
      missing: {
        title: 'Fehlt',
        text: {
          market: 'Auf die Einkaufsliste setzen, was ausgegangen ist.',
          ordering: 'Für die nächste Bestellung vormerken, was ausgegangen ist.',
          stock: 'Nachsehen, was unter dem Mindestbestand liegt.',
        },
      },
      production: { title: 'Produktion', text: 'Ein Rezept wurde gekocht oder vorbereitet.' },
      meals: { title: 'Mahlzeiten', text: 'Erwartete und ausgegebene Mahlzeiten zählen.' },
      sales: { title: 'Verkäufe', text: 'Verkaufte Portionen oder den Tagesumsatz erfassen.' },
      revenue: { title: 'Umsatz', text: 'Den Tagesumsatz der Kasse erfassen.' },
      count: { title: 'Inventur', text: 'Zählen, was da ist.' },
      article: { title: 'Artikel', text: 'Einen neuen Artikel mit Preis und Lagerort anlegen.' },
      recipe: { title: 'Rezept', text: 'Ein neues Gericht oder eine Komponente anlegen.' },
    },
  },
} as const;
