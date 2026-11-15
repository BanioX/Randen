import { formatDecimal } from '@randen/core';

/** A count with its noun: «1 Charge», «84 Chargen», with the Swiss thousands mark. */
const count = (value: number, one: string, many: string) =>
  `${formatDecimal(value, { digits: 0 })} ${value === 1 ? one : many}`;

/** Texts of the demo business (de-CH, «ss», «du»). */
export const demoMessages = {
  title: 'Demo-Betrieb',
  back: 'Mehr',
  subtitle: {
    empty: 'Eine eingerichtete Beispielküche zum Ausprobieren.',
    demo: (name: string) => `${name} ist der Demo-Betrieb. Namen und Preise sind erfunden.`,
    own: 'Dein Betrieb hat schon eigene Daten.',
  },
  introTitle: 'Was der Demo-Betrieb ist',
  intro: [
    'Der Demo-Betrieb ist ein eingerichtetes Bistro mit acht Wochen Geschichte: Lager mit Ablaufdaten, Rezepte mit Fotos und Kalkulation, Speisekarten, ein Menüplan und die Zahlen dazu.',
    'Namen, Lieferanten und Preise sind erfunden; die Preise sind Beispielwerte.',
    'Probier alles aus und entferne die Demo-Daten danach mit einem Tipp.',
  ],
  load: 'Demo-Betrieb laden',
  loading: 'Wird eingerichtet …',
  progressLabel: 'Demo-Betrieb wird eingerichtet',
  progressText:
    'Lager, Rezepte und acht Wochen Zahlen werden angelegt. Das dauert ein paar Sekunden; lass die Seite so lange offen.',
  loaded: (articles: number, dishes: number, weeks: number) =>
    `Demo-Betrieb geladen: ${count(articles, 'Artikel', 'Artikel')}, ${count(dishes, 'Gericht', 'Gerichte')}, ${count(weeks, 'Woche', 'Wochen')} Zahlen`,
  toCockpit: 'Zum Cockpit',

  promiseTitle: 'Was er enthält',
  promise: {
    areas: (areas: number, spots: number) =>
      `${count(areas, 'Lagerbereich', 'Lagerbereiche')} mit ${count(spots, 'Platz', 'Plätzen')} und Fotos`,
    articles: (articles: number, suppliers: number) =>
      `${count(articles, 'Artikel', 'Artikel')} von ${count(suppliers, 'Lieferant', 'Lieferanten')}, mit Chargen und Daten`,
    recipes: (dishes: number, components: number) =>
      `${count(dishes, 'Gericht', 'Gerichte')} und ${count(components, 'Komponente', 'Komponenten')} mit Kalkulation`,
    market: (receipts: number) =>
      `${count(receipts, 'Beleg', 'Belege')} bei Markt Nord, mit Depot, Privatem und Kolli`,
    menu: (cards: number) =>
      `${count(cards, 'Speisekarte', 'Speisekarten')} und ein Menüplan für die Woche`,
    lunch: (lines: number, days: number) =>
      `${count(lines, 'Menülinie', 'Menülinien')} fürs Mittag mit Mahlzeiten an ${count(days, 'Tag', 'Tagen')}`,
    history: (weeks: number) =>
      `${count(weeks, 'Woche', 'Wochen')} Wareneingänge, Produktionen, Verkäufe und Abschreiber`,
    control: 'Temperaturen und Reinigungsplan der Selbstkontrolle',
    team: (staff: number) => `${count(staff, 'Person', 'Personen')} im Team, mit Rolle`,
  },

  summary: {
    history: 'Geschichte',
    historyValue: (weeks: number) => count(weeks, 'Woche', 'Wochen'),
    historyHint: (from: string, to: string) => `${from} bis ${to}`,
    articles: 'Artikel',
    articlesHint: (suppliers: number) => `von ${count(suppliers, 'Lieferant', 'Lieferanten')}`,
    dishes: 'Gerichte',
    dishesHint: (components: number) => `und ${count(components, 'Komponente', 'Komponenten')}`,
    movements: 'Lagerbewegungen',
    movementsHint: (deliveries: number) =>
      `aus ${count(deliveries, 'Wareneingang', 'Wareneingängen')} und Verkäufen`,
  },

  contentsTitle: 'Was drin ist',
  contentsHint: 'Jede Zeile führt zum Bereich mit den Beispieldaten.',
  rows: {
    areas: 'Wo ist was?',
    areasText: (areas: number, spots: number) =>
      `${count(areas, 'Lagerbereich', 'Lagerbereiche')}, ${count(spots, 'Platz', 'Plätze')} mit Foto`,
    articles: 'Artikel und Lieferanten',
    articlesText: (articles: number, suppliers: number) =>
      `${count(articles, 'Artikel', 'Artikel')}, ${count(suppliers, 'Lieferant', 'Lieferanten')}`,
    stock: 'Lager',
    stockText: (lots: number, movements: number) =>
      `${count(lots, 'Charge', 'Chargen')} an Lager, ${count(movements, 'Lagerbewegung', 'Lagerbewegungen')}`,
    recipes: 'Rezepte',
    recipesText: (dishes: number, components: number) =>
      `${count(dishes, 'Gericht', 'Gerichte')}, ${count(components, 'Komponente', 'Komponenten')}`,
    production: 'Produktion',
    productionText: (productions: number) => count(productions, 'Produktion', 'Produktionen'),
    menu: 'Speisekarte',
    menuText: (cards: number) => count(cards, 'Speisekarte', 'Speisekarten'),
    meals: 'Mahlzeiten',
    mealsText: (lines: number, meals: number, weighings: number) =>
      `${count(lines, 'Menülinie', 'Menülinien')}, ${count(meals, 'Mahlzeitenzahl', 'Mahlzeitenzahlen')}, ${count(weighings, 'Wägung', 'Wägungen')}`,
    plan: 'Menüplan',
    planText: (entries: number) => `${count(entries, 'Eintrag', 'Einträge')} ab heute`,
    purchasing: 'Einkauf',
    purchasingText: (deliveries: number, receipts: number, orders: number) =>
      `${count(deliveries, 'Lieferung', 'Lieferungen')}, ${count(receipts, 'Beleg', 'Belege')} vom Markt, ${count(orders, 'Bestellung', 'Bestellungen')}`,
    numbers: 'Zahlen',
    numbersText: (sales: number, budgets: number) =>
      `${count(sales, 'Verkaufszeile', 'Verkaufszeilen')}, ${count(budgets, 'Budget', 'Budgets')}`,
    haccp: 'Selbstkontrolle',
    haccpText: (temperatures: number, checks: number) =>
      `${count(temperatures, 'Temperatur', 'Temperaturen')}, ${count(checks, 'Reinigung', 'Reinigungen')}`,
    team: 'Team',
    teamText: (staff: number) => count(staff, 'Person', 'Personen'),
  },

  goodToKnowTitle: 'Gut zu wissen',
  goodToKnow: [
    'Der Demo-Betrieb lädt nur in einen leeren Betrieb, damit sich nichts mit deinen Daten vermischt.',
    'Alles bleibt auf diesem Gerät, wie jeder Betrieb in Randen.',
    'Was du im Demo-Betrieb erfasst, verschwindet mit ihm.',
  ],

  ownTitle: 'Der Demo-Betrieb lädt nur in einen leeren Betrieb',
  ownText:
    'Dein Betrieb hat schon Artikel, Rezepte oder Lager. Damit nichts vermischt wird, bleibt er, wie er ist. Sichere ihn, bevor du etwas löschst.',
  toData: 'Zu Sichern und Löschen',

  removeTitle: 'Demo-Daten entfernen',
  removeText:
    'Entfernt den ganzen Demo-Betrieb von diesem Gerät. Danach beginnt Randen mit einem leeren Betrieb.',
  remove: 'Demo-Daten entfernen',
  removeConfirmTitle: 'Demo-Daten entfernen?',
  removeConfirmText:
    'Der ganze Demo-Betrieb wird von diesem Gerät gelöscht: Artikel, Rezepte, Lager, Zahlen und alles, was du darin erfasst hast. Danach beginnt Randen mit einem leeren Betrieb.',
  removeConfirm: 'Entfernen',
  removing: 'Wird entfernt …',
} as const;
