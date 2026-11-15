/** Sales of a dish in the last 28 days, in words. */
const salesIn28Days = (sold: number) =>
  sold === 0 ? 'kein Verkauf in 28 Tagen' : `${String(sold)} Portionen in 28 Tagen`;

/** Texts of «Produktion» and «Menüplan» (de-CH, «ss», «du»). Every text of the feature is here. */
export const productionMessages = {
  cancel: 'Abbrechen',
  weekdays: ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'],
  kinds: { dish: 'Gericht', component: 'Komponente' },
  diets: { vegan: 'vegan', vegetarian: 'vegetarisch', omnivore: 'mit Fleisch oder Fisch' },
  dateKinds: { use_by: 'Verbrauchsdatum', best_before: 'Mindesthaltbarkeit' },
  origins: {
    purchase: 'Wareneingang',
    production: 'Eigenproduktion',
    opening: 'Anfangsbestand',
    count: 'Inventur',
  },
  margin: {
    good: 'im Ziel',
    watch: 'knapp über dem Ziel',
    over: 'über dem Ziel',
    unknown: 'Preis fehlt',
  },

  production: {
    title: 'Produktion',
    newAction: 'Produktion erfassen',
    todayTitle: 'Heute im Menüplan',
    todayEmpty: 'Heute ist nichts geplant. Die Woche planst du im Menüplan.',
    planLink: 'Zum Menüplan',
    produce: 'Produzieren',
    runsTitle: 'Die letzten 14 Tage',
    runsCaption: 'Produktionen der letzten 14 Tage',
    runsEmpty:
      'Noch keine Produktion in den letzten 14 Tagen. Mit der ersten Produktion siehst du hier, was verbraucht wurde.',
    batches: (count: number) => (count === 1 ? '1 Ansatz' : `${String(count)} Ansätze`),
    portionCount: (count: number) => (count === 1 ? '1 Portion' : `${String(count)} Portionen`),
    runMeta: (portions: string, who: string | undefined) =>
      who === undefined ? portions : `${portions} · ${who}`,
    costMeta: (cost: string, perPortion: string) => `${cost} · ${perPortion} je Portion`,
    shortageCount: (count: number) => (count === 1 ? '1 Fehlmenge' : `${String(count)} Fehlmengen`),
    notFound: 'Diese Produktion gibt es nicht mehr.',
  },

  newPage: {
    title: 'Produktion erfassen',
    what: 'Was produziert wird',
    back: 'Produktion',
    recipe: 'Rezept',
    recipeHint:
      'Ein Gericht oder eine Komponente. Die Zutaten rechnet Randen auf die Portionen um.',
    portions: 'Portionen',
    portionsLess: (label: string) => `${label} verringern`,
    portionsMore: (label: string) => `${label} erhöhen`,
    previewTitle: 'Bedarf und Lager',
    previewCaption: 'Bedarf je Zutat, was im Lager ist und was fehlt',
    columns: { ingredient: 'Zutat', need: 'Bedarf', stock: 'Im Lager', missing: 'Fehlt' },
    takes: (area: string, quantity: string, date: string | undefined) =>
      date === undefined ? `${area}: ${quantity}` : `${area}: ${quantity}, ${date}`,
    unusable: (quantity: string, date: string) => `Nicht mehr verwenden: ${quantity}, ${date}`,
    noLots: 'Keine Charge im Lager',
    shortages: (count: number) =>
      count === 1
        ? '1 Zutat reicht nicht: produzieren und die Fehlmenge festhalten.'
        : `${String(count)} Zutaten reichen nicht: produzieren und die Fehlmenge festhalten.`,
    summary: (portions: number, cost: string) =>
      `${String(portions)} Portionen, Wareneinsatz ${cost}`,
    outputTitle: 'Ergebnis',
    outputQuantity: 'Menge',
    outputArea: 'Lagerbereich',
    outputDate: 'Haltbar bis',
    outputDateHint: (days: number) => `Richtwert: ${String(days)} Tage ab heute`,
    outputNoDate: 'Ohne Richtwert. Das Datum setzt du selbst.',
    produceAction: 'Produzieren',
    produced: 'Produziert',
    resultCost: 'Wareneinsatz',
    resultPerPortion: 'Je Portion',
    resultShortages: 'Fehlmengen',
    resultNoShortages: 'Alles war im Lager.',
    labelAction: 'Etikett drucken',
    openRun: 'Produktion ansehen',
    toast: (name: string) => `${name} produziert`,
    planned: 'Eingeplant: ',
    fromPlan: 'Aus dem Menüplan',
    noRecipe: 'Wähle zuerst ein Rezept.',
    error: 'Die Produktion lässt sich nicht buchen.',
    done: 'Erledigt',
  },

  runPage: {
    back: 'Produktion',
    insTitle: 'Was hineinging',
    insCaption: 'Chargen, aus denen die Zutaten kamen',
    insEmpty: 'Keine Zutat hat das Lager verlassen.',
    outTitle: 'Was herauskam',
    outEmpty: 'Dieses Gericht hat keine Charge. Es ist in den Zahlen als Verbrauch geführt.',
    shortagesTitle: 'Fehlmengen',
    summaryTitle: 'Produktion',
    statCost: 'Wareneinsatz',
    statPerPortion: 'Je Portion',
    statPortions: 'Portionen',
    columns: {
      ingredient: 'Zutat',
      quantity: 'Menge',
      value: 'Wert',
      lot: 'Charge',
      supplier: 'Lieferant',
      received: 'Eingang',
      expires: 'Datum',
    },
    lotCode: (code: string) => `Charge ${code}`,
    remaining: (quantity: string) => `noch ${quantity} im Lager`,
    labelTitle: 'Etikett',
    labelAction: 'Etikett drucken',
    labelHint: 'Das Etikett druckst du auf einem Etikettendrucker oder einem Papierstreifen.',
    notFoundTitle: 'Produktion nicht gefunden',
    notFoundText: 'Diese Produktion gibt es nicht mehr.',
  },

  label: {
    producedOn: 'Produziert',
    useBy: (kind: string) => kind,
    quantity: 'Menge',
    portions: (count: number) => `${String(count)} Portionen`,
    allergens: 'Allergene',
    traces: 'Spuren',
    noAllergens: 'keine deklarierungspflichtigen Allergene',
    diet: 'Kost',
    incomplete: 'Deklaration unvollständig: vor dem Verkauf prüfen',
    producedBy: 'Hergestellt von',
    code: 'Code',
  },

  plan: {
    title: 'Menüplan',
    back: 'Menüplan',
    week: (week: number) => `KW ${String(week)}`,
    weekRange: (from: string, to: string) => `${from} bis ${to}`,
    today: 'Heute',
    previous: 'Vorherige Woche',
    next: 'Nächste Woche',
    add: 'Gericht einplanen',
    /** The add button of a day: its name for the screen reader, with the day in Swiss form. */
    addOn: (date: string) => `Gericht am ${date} einplanen`,
    fill: 'Woche füllen',
    copy: 'Woche kopieren',
    print: 'Drucken',
    lines: 'Menülinien',
    emptyDay: 'Noch nichts geplant',
    entryMeta: (portions: number) => `${String(portions)} Portionen`,
    dayTotals: (portions: number) => `${String(portions)} Portionen`,
    dayRevenue: (revenue: string, cost: string) => `Erlös ${revenue} · Wareneinsatz ${cost}`,
    unpriced: (count: number) => `${String(count)} ohne Preis oder Kosten`,
    producedBadge: 'Produziert',
    lineAllergens: (name: string) => (name === '' ? 'Ohne Linie' : name),
    allergensNone: 'keine Allergene',
    warningDiet: (requiredDiet: string, diet: string) =>
      `Die Linie verspricht ${requiredDiet}, die Gerichte sind ${diet}.`,
    warningAllergen: (allergen: string, trace: boolean) =>
      trace
        ? `Die Linie verspricht frei von ${allergen}, ein Gericht hat Spuren.`
        : `Die Linie verspricht frei von ${allergen}, ein Gericht enthält es.`,
    noWeekEntries: 'Diese Woche ist noch leer. Plane das erste Gericht oder fülle die Woche.',
    rightNow: 'Woche',
    weekSummary: (entries: number, portions: number) =>
      `${String(entries)} Einträge, ${String(portions)} Portionen`,
    mealsPlanned: 'erwartet',
  },

  entry: {
    title: 'Eintrag',
    portions: 'Portionen',
    note: 'Notiz',
    notePlaceholder: 'z. B. ohne Nüsse',
    line: 'Menülinie',
    noLine: 'Ohne Linie',
    save: 'Sichern',
    remove: 'Aus dem Plan nehmen',
    removeTitle: 'Eintrag aus dem Plan nehmen?',
    removeText: (dish: string) =>
      `${dish} verschwindet aus dem Plan. Produktionen bleiben in den Zahlen.`,
    produce: 'Produzieren',
    producedNote: 'Schon produziert. Die Produktion bleibt bestehen.',
    saved: 'Gesichert',
    removed: 'Aus dem Plan genommen',
    error: 'Der Eintrag lässt sich nicht ändern.',
  },

  add: {
    title: 'Gericht einplanen',
    recipe: 'Gericht',
    date: 'Tag',
    slot: 'Mahlzeit',
    line: 'Menülinie',
    portions: 'Portionen',
    action: 'Einplanen',
    missing: 'Wähle zuerst ein Gericht.',
    done: (dish: string) => `${dish} eingeplant`,
    error: 'Das Gericht lässt sich nicht einplanen.',
  },

  suggest: {
    title: 'Reste verwerten',
    caption: 'Gerichte, die Ware mit nahem Datum verwerten, nach dem Wert der gesparten Ware.',
    empty: 'Nichts läuft in den nächsten 7 Tagen ab.',
    saves: (name: string, quantity: string, date: string, value: string) =>
      `verwertet ${quantity} ${name}, ${date}, ${value}`,
    uses: (name: string, quantity: string, date: string) =>
      `verwertet ${quantity} ${name}, ${date}`,
    portions: (count: number) => `${String(count)} Portionen`,
    latest: (date: string) => `bis ${date} kochen`,
    missing: (names: string) => `Fehlt: ${names}`,
    add: 'Einplanen',
    planned: 'Schon eingeplant',
    notReady: 'Nicht bereit',
    done: (dish: string, date: string) => `${dish} am ${date} eingeplant`,
  },

  demand: {
    title: 'Bedarf dieser Woche',
    caption: 'Was die offenen Gerichte brauchen und im Lager fehlt',
    empty: 'Für diese Woche fehlt nichts.',
    missing: (quantity: string) => `fehlt ${quantity}`,
    link: 'Zum Einkauf',
    columns: { ingredient: 'Zutat', needed: 'Bedarf', usable: 'Im Lager', missing: 'Fehlt' },
  },

  fill: {
    title: 'Woche füllen?',
    text: 'Die leeren Mahlzeiten bekommen Vorschläge: zuerst Gerichte, die Ware mit nahem Datum verwerten, dann die besten nach Marge und Verkauf. Bestehende Einträge bleiben.',
    action: 'Woche füllen',
    resultTitle: 'Woche gefüllt',
    resultCount: (count: number, skipped: number) => {
      const dishes = count === 1 ? '1 Gericht geplant' : `${String(count)} Gerichte geplant`;
      if (skipped === 0) {
        return `${dishes}.`;
      }
      const meals =
        skipped === 1 ? '1 Mahlzeit bleibt leer' : `${String(skipped)} Mahlzeiten bleiben leer`;
      return `${dishes}, ${meals}.`;
    },
    reasonExpiring: (name: string, quantity: string, date: string) =>
      `verwertet ${quantity} ${name}, läuft am ${date} ab`,
    /** Under «Erweitert»: the sales and the margin status (an evaluation). */
    reasonRanking: (sold: number, status: string) => `${salesIn28Days(sold)}, Marge ${status}`,
    /** Without «Erweitert»: the sales alone. */
    reasonSales: (sold: number) => salesIn28Days(sold),
    nothingLeft: 'Keine Mahlzeit ist leer, oder kein Gericht passt.',
    done: (count: number) => `${String(count)} Gerichte eingeplant`,
  },

  copy: {
    title: 'Woche kopieren?',
    text: (week: number) =>
      `Die Einträge kommen in die Woche KW ${String(week)}. Die Zielwoche muss leer sein.`,
    action: 'Kopieren',
    done: (count: number) => `${String(count)} Einträge kopiert`,
    /** Entries that are not copied: their dish or their line is no longer on the menu. */
    skipped: (count: number) =>
      count === 1
        ? '1 Eintrag übersprungen, das Gericht oder die Linie ist nicht mehr aktiv.'
        : `${String(count)} Einträge übersprungen, das Gericht oder die Linie ist nicht mehr aktiv.`,
    empty: 'Diese Woche hat keine Einträge zum Kopieren.',
  },

  lines: {
    title: 'Menülinien',
    text: 'Menülinien sind feste Listen wie «Menü 1» oder «Vegi». Das Versprechen einer Linie prüft Randen gegen die Allergene der Gerichte.',
    add: 'Linie hinzufügen',
    name: 'Name',
    slot: 'Mahlzeit',
    slotAny: 'Jede Mahlzeit',
    diet: 'Verspricht Kost',
    dietAny: 'Kein Versprechen',
    freeOf: 'Frei von',
    rename: 'Speichern',
    deactivate: 'Deaktivieren',
    activate: 'Aktivieren',
    up: (name: string) => `${name} nach oben`,
    down: (name: string) => `${name} nach unten`,
    inactive: 'inaktiv',
    empty: 'Noch keine Menülinie. Mit einer Linie siehst du die Allergene je Tag und Linie.',
    created: (name: string) => `${name} angelegt`,
    saved: 'Gesichert',
  },

  meals: {
    title: 'Mahlzeiten',
    caption: 'Erwartet nach Plan, ausgegeben nach Ausgabe',
    expected: 'Erwartet',
    served: 'Ausgegeben',
    edit: (day: string, slot: string) => `${day}, ${slot} bearbeiten`,
    sheetTitle: (day: string, slot: string) => `${day}, ${slot}`,
    save: 'Sichern',
    empty:
      'Mit dem Plan erwartet Randen die Mahlzeiten. Trag ausgegebene Mahlzeiten nach der Ausgabe ein.',
    saved: 'Mahlzeiten gesichert',
    perDay: (count: number) => `${String(count)} Mahlzeiten`,
  },

  weighings: {
    title: 'Tellerrücklauf',
    caption: 'Gewogen in Gramm, ohne Abschreiber',
    add: 'Wägung erfassen',
    kinds: { plate: 'Tellerrücklauf', serving: 'Ausgaberest', production: 'Produktionsabfall' },
    grams: 'Gramm',
    missing: 'Trag die Gramm ein.',
    kind: 'Art',
    slot: 'Mahlzeit',
    date: 'Tag',
    action: 'Erfassen',
    sum: (grams: string) => `${grams} gewogen`,
    empty: 'Noch nichts gewogen.',
    removeAction: (kind: string) => `${kind} entfernen`,
    saved: 'Gewogen',
    removed: 'Wägung entfernt',
    note: 'Wägungen verändern den Lagerbestand nicht.',
  },

  print: {
    action: 'Drucken',
    weekTitle: 'Menüplan',
    labelHint: 'Etikett',
  },

  errors: {
    notAllowed: 'Das geht hier nicht: der Eintrag ist nicht mehr gültig.',
    unknown: 'Das hat nicht geklappt. Versuch es noch einmal.',
  },
};
