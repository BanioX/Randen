/**
 * Texts of «Artikel» and «Lieferanten» (de-CH, «ss», one person addressed with «du»): calm and
 * exact, the words of the glossary. Functions take values that are already formatted.
 */
export const articlesMessages = {
  title: 'Artikel',
  /** What an article still lacks: said the same way in the list, on the detail page and in the import. */
  missing: {
    price: 'Preis fehlt',
    origin: 'Herkunft fehlt',
    supplier: 'Lieferant fehlt',
  },
  inactive: 'inaktiv',
  prepared: 'Eigenproduktion',
  noStock: 'nichts an Lager',
  reorder: 'nachbestellen',
  minStock: (quantity: string) => `Mindestbestand ${quantity}`,
  none: '–',

  list: {
    suppliers: 'Lieferanten',
    create: 'Artikel erfassen',
    import: 'Mehrere auf einmal',
    search: 'Artikel suchen',
    searchPlaceholder: 'Name, Warengruppe oder Lieferant',
    view: 'Ansicht',
    views: {
      all: 'Alle',
      // A soft hyphen: where the segment is narrow, the word breaks at its joint.
      below_min: 'Unter Mindest\u00ADbestand',
      no_price: 'Ohne Preis',
      inactive: 'Inaktiv',
    },
    viewWithCount: (label: string, count: number) => `${label} (${String(count)})`,
    category: 'Warengruppe',
    allCategories: 'Alle Warengruppen',
    categoryWithCount: (label: string, count: number) => `${label} (${String(count)})`,
    caption: 'Artikel',
    columns: {
      article: 'Artikel',
      stock: 'Bestand',
      price: 'Preis',
      supplier: 'Lieferant',
      place: 'Platz',
    },
    emptyTitle: 'Noch keine Artikel',
    emptyText:
      'Ein Artikel ist, was an Lager liegt. Mit dem ersten kennt Randen Preis, Allergene und Lagerort.',
    noMatch: 'Kein Artikel passt. Ändere die Suche oder die Warengruppe.',
    noneInView: {
      all: 'Kein aktiver Artikel. Inaktive stehen unter «Inaktiv».',
      below_min: 'Kein Artikel liegt unter dem Mindestbestand.',
      no_price: 'Jeder Artikel hat einen Preis.',
      inactive: 'Kein Artikel ist inaktiv.',
    },
  },

  detail: {
    edit: 'Bearbeiten',
    stock: 'Bestand',
    lots: (count: number) => (count === 1 ? '1 Charge' : `${String(count)} Chargen`),
    belowMin: (quantity: string) => `unter dem Mindestbestand von ${quantity}`,
    stockValue: 'Lagerwert',
    lastPrice: 'Letzter Preis',
    recipePrice: 'Kosten laut Rezept',
    priceUp: (share: string) => `${share} teurer als beim Einkauf davor`,
    priceDown: (share: string) => `${share} günstiger als beim Einkauf davor`,
    priceSame: 'wie beim Einkauf davor',
    noPurchase: 'noch kein Wareneingang',
    fromRecipe: 'aus den Preisen der Zutaten',
    nextDate: 'Nächstes Datum',
    noDate: 'kein Datum an Lager',
    dateKinds: {
      best_before: 'mindestens haltbar bis',
      use_by: 'zu verbrauchen bis',
    },
    open: 'Noch offen',
    openTexts: {
      price: 'Preis fehlt: Ohne Preis rechnet Randen keinen Wareneinsatz.',
      pricePrepared: 'Preis fehlt: Im Rezept hat eine Zutat noch keinen Preis.',
      origin: 'Herkunft fehlt: Bei Fleisch und Fisch steht das Land auf der Speisekarte.',
      supplier: 'Lieferant fehlt: Ohne Lieferant steht der Artikel in keinem Bestellvorschlag.',
    },
    complete: 'Angaben ergänzen',
    openRecipe: 'Zum Rezept',
    madeBy: (recipe: string) => `Hergestellt nach dem Rezept «${recipe}».`,
    madeByBatch: (recipe: string, quantity: string) =>
      `Hergestellt nach dem Rezept «${recipe}»: Ein Ansatz ergibt ${quantity}.`,
    declaration: 'Allergene und Herkunft',
    contains: 'Enthält',
    noAllergens: 'keine Allergene erfasst',
    traces: 'Kann Spuren enthalten',
    diet: 'Diät',
    origin: 'Herkunft',
    originMissing: 'fehlt',
    declarationFromRecipe: 'Berechnet aus den Zutaten des Rezepts.',
    priceHistory: 'Preisverlauf',
    priceHistoryHint: (count: number) =>
      count === 1 ? 'Der letzte Einkauf' : `Die letzten ${String(count)} Einkäufe`,
    productionHistoryHint: (count: number) =>
      count === 1 ? 'Die letzte Produktion' : `Die letzten ${String(count)} Produktionen`,
    noHistory: 'Noch kein Wareneingang. Mit der ersten Lieferung beginnt der Preisverlauf.',
    noHistoryPrepared: 'Noch keine Produktion. Mit der ersten beginnt der Verlauf der Kosten.',
    chartSummary: (count: number, first: string, last: string) =>
      `Preis über ${String(count)} Einkäufe: zuerst ${first}, zuletzt ${last}.`,
    chartCategory: 'Datum',
    chartValue: (unit: string) => `Preis pro ${unit}`,
    historyCaption: 'Einkäufe',
    historyShowAll: (count: number) => `Alle ${String(count)} anzeigen`,
    historyShowLess: 'Weniger anzeigen',
    historyColumns: {
      date: 'Datum',
      price: 'Preis',
      change: 'Änderung',
    },
    usedIn: 'Verwendet in',
    usedInNone: 'In keinem Rezept verwendet.',
    perPortions: (quantity: string, portions: number) =>
      portions === 1
        ? `${quantity} für 1 Portion`
        : `${quantity} für ${String(portions)} Portionen`,
    perBatch: (quantity: string) => `${quantity} pro Ansatz`,
    recipeInactive: 'inaktiv',
    storage: 'Lager und Bestellung',
    facts: {
      supplier: 'Lieferant',
      area: 'Lagerbereich',
      spot: 'Platz',
      minStock: 'Mindestbestand',
      targetStock: 'Sollbestand',
      pack: 'Bestelleinheit',
      shelfLife: 'Haltbarkeit',
      dateKind: 'Datum',
      yield: 'Ausbeute',
      supplierArticleNumber: 'Artikelnummer des Lieferanten',
      gtin: 'GTIN',
      note: 'Notiz',
    },
    notSet: 'nicht festgelegt',
    packWithLabel: (label: string, size: string) => `${label} à ${size}`,
    days: (days: number) => (days === 1 ? '1 Tag' : `${String(days)} Tage`),
    dateKindNames: {
      best_before: 'Mindestens haltbar bis',
      use_by: 'Zu verbrauchen bis',
    },
    deactivate: 'Inaktiv setzen',
    activate: 'Aktiv setzen',
    deactivated: (name: string) => `${name} ist inaktiv.`,
    activated: (name: string) => `${name} ist wieder aktiv.`,
    inactiveNotice:
      'Dieser Artikel ist inaktiv: Er steht in keiner Auswahl und in keinem Bestellvorschlag. Bestand und Zahlen bleiben.',
    remove: 'Löschen',
    removeTitle: (name: string) => `${name} löschen?`,
    removeText:
      'Der Artikel verschwindet aus Listen und Auswahlfeldern. Wareneingänge, Verbrauch und Abschreiber bleiben in den Zahlen.',
    removed: (name: string) => `${name} gelöscht.`,
    blockedTitle: (name: string) => `${name} wird noch gebraucht`,
    blockedStock: (quantity: string) =>
      `Es sind noch ${quantity} an Lager. Verbrauche den Bestand oder schreib ihn ab.`,
    blockedRecipes: (count: number) =>
      count === 1
        ? '1 Rezept rechnet mit dem Artikel. Nimm ihn dort zuerst heraus.'
        : `${String(count)} Rezepte rechnen mit dem Artikel. Nimm ihn dort zuerst heraus.`,
    blockedOrders: (count: number) =>
      count === 1
        ? 'Er steht in 1 offenen Bestellung.'
        : `Er steht in ${String(count)} offenen Bestellungen.`,
    blockedAdvice:
      'Bis dahin kannst du ihn inaktiv setzen: Er verschwindet aus der Auswahl, Bestand und Zahlen bleiben.',
    blockedGeneric:
      'Der Artikel hat noch Bestand oder steht in einem Rezept oder einer offenen Bestellung. Darum lässt er sich nicht löschen.',
    close: 'Schliessen',
  },

  form: {
    createTitle: 'Artikel erfassen',
    editTitle: 'Artikel bearbeiten',
    save: 'Sichern',
    cancel: 'Abbrechen',
    saved: 'Gesichert',
    sections: {
      article: 'Artikel',
      price: 'Preis und Ausbeute',
      declaration: 'Allergene und Herkunft',
      storage: 'Lager und Bestellung',
      more: 'Weitere Angaben',
    },
    name: 'Name',
    namePlaceholder: 'Wie auf dem Lieferschein',
    duplicate: 'Diesen Artikel gibt es schon. Wähle einen anderen Namen.',
    category: 'Warengruppe',
    categoryHint: 'Schlägt Lagerbereich, Haltbarkeit und Diät vor.',
    unit: 'Einheit',
    units: { g: 'Gewicht', ml: 'Volumen', pcs: 'Stück' },
    unitHint: 'Gewicht in kg und g · Volumen in l, dl und ml · Stück als Zahl.',
    unitLocked: {
      stock: 'Die Einheit bleibt, wie sie ist: Zu diesem Artikel sind schon Chargen gebucht.',
      recipes: 'Die Einheit bleibt, wie sie ist: Rezepte rechnen damit.',
    },
    price: 'Einkaufspreis',
    priceHint: 'Der letzte Einkaufspreis. Jeder Wareneingang führt ihn nach.',
    yield: 'Ausbeute',
    yieldHint: 'Was nach dem Rüsten bleibt, als Richtwert. 100 %, wenn nichts wegfällt.',
    yieldEffect: (share: string, net: string, gross: string) =>
      `Bei ${share} Ausbeute kostet, was in die Pfanne kommt, ${net} statt ${gross}.`,
    fromRecipe: (recipe: string) =>
      `Name, Preis, Allergene und Diät gehören zum Rezept «${recipe}» und werden dort geändert.`,
    fromRecipeUnknown:
      'Name, Preis, Allergene und Diät gehören zum Rezept und werden dort geändert.',
    openRecipe: 'Zum Rezept',
    contains: 'Enthält',
    containsHint: 'Was auf der Zutatenliste des Lieferanten hervorgehoben ist.',
    traces: 'Kann Spuren enthalten',
    tracesHint: 'Was der Artikel schon enthält, steht hier nicht zur Wahl.',
    diet: 'Diät',
    diets: { vegan: 'Vegan', vegetarian: 'Vegetarisch', omnivore: 'Mit Fleisch oder Fisch' },
    origin: 'Herkunft',
    originHint: 'Bei Fleisch und Fisch steht das Land auf der Speisekarte.',
    originPlaceholder: 'Noch nicht gewählt',
    supplier: 'Lieferant',
    noSupplier: 'Kein Lieferant',
    area: 'Lagerbereich',
    noArea: 'Kein fester Lagerbereich',
    spot: 'Platz',
    proposal: (category: string) => `Vorschlag für ${category}.`,
    minStock: 'Mindestbestand',
    minStockHint: 'Darunter steht der Artikel im Bestellvorschlag.',
    targetStock: 'Sollbestand',
    targetStockHint: 'Bis hierhin wird aufgefüllt.',
    targetBelowMin: (min: string) =>
      `Der Sollbestand liegt unter dem Mindestbestand. Trag mindestens ${min} ein.`,
    packSize: 'Inhalt einer Bestelleinheit',
    packSizeHint: 'Zum Beispiel 10 kg für einen Sack.',
    packSizeMissing: 'Trag ein, wie viel eine Bestelleinheit enthält.',
    packLabel: 'Bestelleinheit',
    packLabelPlaceholder: 'Sack, Karton, Kiste',
    shelfLife: 'Haltbarkeit',
    days: 'Tage',
    shelfLifeHint: 'Für den Vorschlag beim Wareneingang. Das Datum auf der Packung gilt immer.',
    shelfLifeProposal: (category: string) =>
      `Richtwert für ${category}. Das Datum auf der Packung gilt immer.`,
    dateKind: 'Datum auf der Packung',
    dateKinds: { best_before: 'Mindestens haltbar bis', use_by: 'Zu verbrauchen bis' },
    supplierArticleNumber: 'Artikelnummer des Lieferanten',
    gtin: 'GTIN',
    gtinHint: 'Die Nummer unter dem Strichcode.',
    gtinInvalid: 'Diese Nummer stimmt nicht. Prüfe die Ziffern unter dem Strichcode.',
    note: 'Notiz',
  },

  import: {
    title: 'Mehrere Artikel erfassen',
    intro:
      'Eine Zeile pro Artikel: Name; Einheit; Preis pro Einheit; Lieferant. Preis und Lieferant sind freiwillig. Zeilen aus einer Tabelle gehen auch.',
    units: 'Einheiten: kg, g, l, dl, ml, Stk.',
    lines: 'Zeilen',
    placeholder:
      'Rindsentrecôte; kg; 62.00; Metzgerei Muster\nVollrahm; l; 6.40\nEier; Stk; 0.45; Grosshandel Beispiel',
    caption: 'Vorschau',
    columns: {
      article: 'Artikel',
      price: 'Preis',
      supplier: 'Lieferant',
      category: 'Warengruppe',
    },
    line: (number: number) => `Zeile ${String(number)}`,
    categoryOf: (name: string) => `Warengruppe für ${name}`,
    newSupplier: 'neu',
    noPrice: (unit: string) => `${unit}, ohne Preis`,
    skipped: (count: number) =>
      count === 1 ? '1 Zeile bleibt stehen' : `${String(count)} Zeilen bleiben stehen`,
    skippedList: 'Zeilen, die stehen bleiben',
    problems: {
      name: 'Der Name fehlt oder hat mehr als 120 Zeichen.',
      unit: 'Die Einheit fehlt oder ist unbekannt. Schreib kg, g, l, dl, ml oder Stk.',
      price: 'Der Preis lässt sich nicht lesen. Schreib zum Beispiel 62.00.',
      supplier: 'Der Name des Lieferanten hat mehr als 80 Zeichen.',
      duplicate: 'Diesen Artikel gibt es schon.',
      repeated: 'Der Name steht weiter oben schon einmal.',
    },
    empty: 'Füg oben Zeilen ein. Hier steht dann, was daraus wird.',
    summary: (articles: number, suppliers: number, skipped: number) =>
      [
        articles === 1 ? '1 Artikel' : `${String(articles)} Artikel`,
        suppliers === 0
          ? ''
          : suppliers === 1
            ? ', 1 neuer Lieferant'
            : `, ${String(suppliers)} neue Lieferanten`,
        skipped === 0
          ? '.'
          : skipped === 1
            ? '. 1 Zeile bleibt stehen.'
            : `. ${String(skipped)} Zeilen bleiben stehen.`,
      ].join(''),
    truncated: (max: number) =>
      `Es werden die ersten ${String(max)} Zeilen gelesen. Füg den Rest danach ein.`,
    submit: (count: number) =>
      count === 1 ? '1 Artikel anlegen' : `${String(count)} Artikel anlegen`,
    submitNone: 'Artikel anlegen',
    cancel: 'Abbrechen',
    done: (count: number) =>
      count === 1 ? '1 Artikel angelegt.' : `${String(count)} Artikel angelegt.`,
    doneTitle: (count: number) =>
      count === 1 ? '1 Artikel angelegt' : `${String(count)} Artikel angelegt`,
    doneAll: 'Alle Zeilen sind erfasst.',
    doneRemaining: (count: number) =>
      count === 1
        ? '1 Zeile steht noch im Feld. Korrigiere sie oder lösch sie.'
        : `${String(count)} Zeilen stehen noch im Feld. Korrigiere oder lösch sie.`,
    toArticles: 'Zu den Artikeln',
  },

  suppliers: {
    title: 'Lieferanten',
    back: 'Lieferanten',
    toArticles: 'Artikel',
    create: 'Lieferant erfassen',
    search: 'Lieferanten suchen',
    searchPlaceholder: 'Name oder Kundennummer',
    caption: 'Lieferanten',
    columns: {
      supplier: 'Lieferant',
      articles: 'Artikel',
      nextOrder: 'Nächster Bestelltag',
      nextDelivery: 'Nächster Liefertag',
    },
    articles: (count: number) => (count === 1 ? '1 Artikel' : `${String(count)} Artikel`),
    belowMin: (count: number) => `${String(count)} unter Mindestbestand`,
    noDay: 'kein fester Tag',
    orderOn: (day: string) => `Bestellen: ${day}`,
    day: (weekday: string, relative: string) => `${weekday}, ${relative}`,
    emptyTitle: 'Noch keine Lieferanten',
    emptyText:
      'Mit Lieferanten ordnet Randen den Bestellvorschlag und kennt Bestell- und Liefertage.',
    noMatch: 'Kein Lieferant passt zu dieser Suche.',
    weekdays: {
      mon: 'Mo',
      tue: 'Di',
      wed: 'Mi',
      thu: 'Do',
      fri: 'Fr',
      sat: 'Sa',
      sun: 'So',
    },
    weekdayNames: {
      mon: 'Montag',
      tue: 'Dienstag',
      wed: 'Mittwoch',
      thu: 'Donnerstag',
      fri: 'Freitag',
      sat: 'Samstag',
      sun: 'Sonntag',
    },
    detail: {
      edit: 'Bearbeiten',
      nextOrder: 'Nächster Bestelltag',
      nextDelivery: 'Nächster Liefertag',
      articles: 'Artikel',
      allArticles: 'Alle Artikel',
      minOrder: 'Mindestbestellwert',
      noMinOrder: 'keiner',
      contact: 'Kontakt',
      phone: 'Telefon',
      email: 'E-Mail',
      customerNumber: 'Kundennummer',
      call: (phone: string) => `${phone} anrufen`,
      write: (email: string) => `E-Mail an ${email}`,
      noContact: 'Noch kein Kontakt erfasst.',
      days: 'Bestellen und liefern',
      orderDays: 'Bestelltage',
      deliveryDays: 'Liefertage',
      noDays: 'keine festen Tage',
      note: 'Notiz',
      articlesCaption: 'Artikel dieses Lieferanten',
      columns: { article: 'Artikel', stock: 'Bestand', price: 'Preis' },
      noArticles: 'Noch kein Artikel nennt diesen Lieferanten.',
      remove: 'Löschen',
      removeTitle: (name: string) => `${name} löschen?`,
      removeText:
        'Der Lieferant verschwindet aus Listen und Auswahlfeldern. Wareneingänge und Bestellungen bleiben in den Zahlen.',
      removed: (name: string) => `${name} gelöscht.`,
      blockedTitle: (name: string) => `${name} wird noch gebraucht`,
      blockedArticles: (count: number) =>
        count === 1
          ? '1 Artikel nennt diesen Lieferanten. Trag dort zuerst einen anderen ein.'
          : `${String(count)} Artikel nennen diesen Lieferanten. Trag dort zuerst einen anderen ein.`,
      blockedOrders: (count: number) =>
        count === 1
          ? '1 offene Bestellung geht an ihn. Schliess sie zuerst ab.'
          : `${String(count)} offene Bestellungen gehen an ihn. Schliess sie zuerst ab.`,
      blockedGeneric:
        'Artikel oder offene Bestellungen nennen diesen Lieferanten. Darum lässt er sich nicht löschen.',
      close: 'Schliessen',
    },
    form: {
      createTitle: 'Lieferant erfassen',
      editTitle: 'Lieferant bearbeiten',
      save: 'Sichern',
      cancel: 'Abbrechen',
      saved: 'Gesichert',
      sections: { supplier: 'Lieferant', days: 'Bestellen und liefern', more: 'Weitere Angaben' },
      name: 'Name',
      duplicate: 'Diesen Lieferanten gibt es schon. Wähle einen anderen Namen.',
      customerNumber: 'Kundennummer',
      phone: 'Telefon',
      email: 'E-Mail',
      emailInvalid: 'Diese Adresse stimmt nicht. Prüfe die Schreibweise.',
      orderDays: 'Bestelltage',
      orderDaysHint: 'An diesen Tagen nimmt der Lieferant Bestellungen an.',
      deliveryDays: 'Liefertage',
      minOrder: 'Mindestbestellwert',
      note: 'Notiz',
      notePlaceholder: 'Zum Beispiel: Bestellung bis 14 Uhr.',
    },
  },
} as const;
