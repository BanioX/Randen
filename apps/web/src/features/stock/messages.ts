/**
 * Texts of «Lager» (de-CH, «ss», «du»): stock list, expiry, goods receipt, write-offs, the
 * stock take and the journal. Calm and exact; numbers arrive formatted (docs/regeln.md B).
 */

const lots = (count: number) => (count === 1 ? '1 Charge' : `${count} Chargen`);
const articles = (count: number) => (count === 1 ? '1 Artikel' : `${count} Artikel`);
const areas = (count: number) => (count === 1 ? '1 Lagerbereich' : `${count} Lagerbereichen`);
const bookings = (count: number) => (count === 1 ? '1 Buchung' : `${count} Buchungen`);

export const stockMessages = {
  title: 'Lager',
  back: 'Lager',
  lots,
  articles,
  bookings,

  overview: {
    receive: 'Wareneingang',
    views: { label: 'Ansicht', stock: 'Bestand', expiring: 'Ablauf' },
    kpi: {
      value: 'Lagerwert',
      spread: (articleCount: number, areaCount: number) =>
        `${articles(articleCount)} in ${areas(areaCount)}`,
      empty: 'Noch nichts an Lager',
      withoutPrice: (count: number) => `${lots(count)} ohne Preis`,
      today: 'Läuft heute ab',
      soon: 'In 3 Tagen',
      belowMin: 'Unter Mindestbestand',
      worth: (amount: string) => `Wert ${amount}`,
      nothingDue: 'Nichts fällig',
      aboveMin: 'Alles über dem Minimum',
      reorder: 'Nachbestellen',
    },
    search: 'Artikel suchen',
    area: 'Lagerbereich',
    allAreas: 'Alle',
    filtered: {
      below_min: 'Gezeigt werden nur Artikel unter dem Mindestbestand.',
      expiring: 'Gezeigt werden nur Artikel, die bald ablaufen oder abgelaufen sind.',
    },
    showAll: 'Alle anzeigen',
    expiredNotice: (count: number) =>
      count === 1
        ? '1 Charge ist über dem Verbrauchsdatum.'
        : `${count} Chargen sind über dem Verbrauchsdatum.`,
    expiredLink: 'Ablauf ansehen',
    table: {
      caption: 'Bestand je Artikel',
      article: 'Artikel',
      quantity: 'Bestand',
      value: 'Wert',
      date: 'Nächstes Datum',
      area: 'Lagerbereich',
      total: 'Gezeigter Bestand',
    },
    listLabel: 'Bestand je Artikel',
    minimum: (quantity: string) => `Mindestbestand ${quantity}`,
    reorder: 'nachbestellen',
    priceMissing: 'Preis fehlt',
    noDate: 'ohne Datum',
    nothing: 'nichts an Lager',
    emptyTitle: 'Noch nichts an Lager',
    emptyText:
      'Buche die erste Lieferung. Was schon im Haus liegt, erfasst du als Anfangsbestand: Es zählt nicht als Einkauf.',
    emptyReceive: 'Wareneingang buchen',
    emptyOpening: 'Anfangsbestand erfassen',
    noMatch: 'Kein Artikel passt zu dieser Auswahl.',
    more: {
      title: 'Im Lager erfassen',
      waste: 'Abschreiber',
      wasteText: 'Ware, die nicht mehr verkauft wird',
      count: 'Inventur',
      countText: 'Zählen, was da ist',
      journal: 'Journal',
      journalText: 'Jede Bewegung im Lager',
      opening: 'Anfangsbestand',
      openingText: 'Was beim Start schon im Haus liegt',
    },
  },

  expiring: {
    groups: {
      expired: 'Nicht mehr verwenden',
      today: 'Heute',
      soon: 'In 3 Tagen',
      week: 'Diese Woche',
      past_best_before: 'MHD überschritten',
    },
    groupHint: (amount: string) => `Wert ${amount}`,
    onlyGroup: (group: string) => `Gezeigt wird nur «${group}».`,
    showAll: 'Alle anzeigen',
    usePlan: 'Im Menüplan verwerten',
    writeOff: 'Abschreiben',
    writeOffOf: (article: string, quantity: string) => `Abschreiben, ${article} ${quantity}`,
    table: {
      article: 'Artikel',
      quantity: 'Menge',
      value: 'Wert',
      date: 'Datum',
      place: 'Ort',
      action: 'Aktion',
    },
    notice: {
      title: (count: number) =>
        count === 1 ? '1 Charge nicht mehr verwenden' : `${count} Chargen nicht mehr verwenden`,
      text: (amount: string) =>
        `Das Verbrauchsdatum ist vorbei. Diese Ware wird nicht mehr verkocht. Wert ${amount}.`,
      action: 'Alle abschreiben',
    },
    confirm: {
      title: (count: number) =>
        count === 1 ? '1 Charge abschreiben?' : `${count} Chargen abschreiben?`,
      text: (names: string, amount: string) =>
        `${names}. Wert ${amount}. Die Ware geht mit dem Grund «Abgelaufen» als Abschreiber ins Journal.`,
      action: 'Abschreiben',
    },
    done: (count: number, amount: string) => `${lots(count)} abgeschrieben, ${amount}`,
    emptyTitle: 'Nichts läuft ab',
    emptyText: 'In den nächsten sieben Tagen ist keine Charge fällig.',
    emptyGroup: 'In dieser Gruppe ist keine Charge.',
  },

  date: {
    use_by: (date: string) => `zu verbrauchen bis ${date}`,
    best_before: (date: string) => `mindestens haltbar bis ${date}`,
    none: 'ohne Datum',
    label: { use_by: 'Zu verbrauchen bis', best_before: 'Mindestens haltbar bis' },
  },

  article: {
    notFound: 'Diesen Artikel gibt es nicht mehr.',
    master: 'Stammdaten',
    inactive: 'Dieser Artikel ist nicht mehr aktiv. Was noch an Lager liegt, bleibt sichtbar.',
    kpi: {
      quantity: 'Bestand',
      value: 'Wert',
      lastPrice: (price: string) => `zuletzt ${price}`,
      noPrice: 'Preis fehlt',
      usable: 'Verwendbar',
      allUsable: 'Alles verwendbar',
      blocked: (quantity: string) => `${quantity} nicht mehr verwenden`,
      minimum: 'Mindestbestand',
      target: (quantity: string) => `Soll ${quantity}`,
      below: 'Darunter, nachbestellen',
      noMinimum: 'Nicht festgelegt',
      none: '–',
    },
    lots: {
      title: 'Chargen',
      hint: 'Das früheste Datum geht zuerst.',
      first: 'zuerst verbrauchen',
      doNotUse: 'Nicht mehr verwenden',
      of: (quantity: string, initial: string) => `${quantity} von ${initial}`,
      received: (date: string) => `Eingang ${date}`,
      code: (code: string) => `Charge ${code}`,
      origin: {
        purchase: 'Wareneingang',
        production: 'Eigenproduktion',
        opening: 'Anfangsbestand',
        count: 'Inventur',
      },
      withdraw: 'Entnehmen',
      writeOff: 'Abschreiben',
      move: 'Verschieben',
      actionOf: (action: string, detail: string) => `${action}, Charge ${detail}`,
      emptyTitle: 'Nichts an Lager',
      emptyText: 'Mit dem nächsten Wareneingang erscheint hier die erste Charge.',
      emptyAction: 'Wareneingang buchen',
    },
    movements: {
      title: 'Letzte Bewegungen',
      all: 'Journal',
      empty: 'Noch keine Bewegungen.',
    },
    facts: {
      title: 'Zum Artikel',
      unit: 'Einheit',
      price: 'Letzter Preis',
      yield: 'Ausbeute',
      supplier: 'Lieferant',
      minimum: 'Mindestbestand',
      target: 'Sollbestand',
      missing: '–',
    },
  },

  sheets: {
    cancel: 'Abbrechen',
    quantity: 'Menge',
    note: 'Bemerkung',
    tooMuch: (quantity: string) => `Die Charge hat ${quantity}. Trag höchstens so viel ein.`,
    withdraw: {
      title: 'Entnehmen',
      purpose: 'Wofür',
      purposes: { kitchen: 'Küche', staff: 'Personal' },
      summary: (quantity: string, article: string, amount: string) =>
        `${quantity} ${article}, ${amount}`,
      action: 'Entnehmen',
      done: (quantity: string, article: string, amount: string) =>
        `${quantity} ${article} entnommen, ${amount}`,
    },
    writeOff: {
      title: 'Abschreiben',
      action: 'Abschreiben',
    },
    move: {
      title: 'Verschieben',
      area: 'Neuer Lagerbereich',
      from: (area: string) => `Liegt jetzt in: ${area}`,
      same: 'Die Charge liegt schon in diesem Lagerbereich. Wähle einen anderen.',
      summary: (quantity: string, article: string, area: string) =>
        `${quantity} ${article} nach ${area}`,
      action: 'Verschieben',
      done: (quantity: string, article: string, area: string) =>
        `${quantity} ${article} nach ${area} verschoben`,
    },
  },

  waste: {
    title: 'Abschreiber',
    subtitle: 'Ware, die nicht mehr verkauft wird, geht mit ihrem Wert und dem Grund ins Journal.',
    what: 'Was',
    article: 'Artikel',
    lot: 'Charge',
    lotOption: (date: string, quantity: string, area: string) => `${date} · ${quantity} · ${area}`,
    lotGone: 'Diese Charge ist nicht mehr an Lager. Wähle eine andere.',
    noStock: 'Von diesem Artikel ist nichts an Lager.',
    howMuch: 'Wie viel und warum',
    quantity: 'Menge',
    whole: (quantity: string) => `Ganze Charge: ${quantity}`,
    reason: 'Grund',
    reasonMissing: 'Wähle den Grund.',
    note: 'Bemerkung',
    summary: (quantity: string, article: string, amount: string) =>
      `${quantity} ${article}, ${amount}`,
    action: 'Abschreiben',
    done: (quantity: string, article: string, amount: string) =>
      `${quantity} ${article} abgeschrieben, ${amount}`,
    emptyTitle: 'Nichts an Lager',
    emptyText: 'Abschreiben lässt sich nur, was an Lager liegt.',
  },

  receive: {
    title: 'Wareneingang',
    openingTitle: 'Anfangsbestand',
    openingSubtitle:
      'Was beim Start schon im Haus liegt. Es kommt ins Lager, zählt aber nicht als Einkauf.',
    notFound: 'Diese Bestellung gibt es nicht mehr.',
    order: {
      title: (supplier: string) => `Bestellung bei ${supplier}`,
      text: 'Die Zeilen stammen aus der Bestellung. Prüfe Mengen, Preise und Daten gegen den Lieferschein.',
      received:
        'Diese Bestellung ist schon als geliefert gebucht. Eine weitere Lieferung wird dazugebucht.',
    },
    head: {
      title: 'Lieferung',
      supplier: 'Lieferant',
      date: 'Geliefert am',
      openingDate: 'Stand vom',
      today: 'heute',
      yesterday: 'gestern',
      document: 'Lieferschein-Nr.',
    },
    lines: {
      title: 'Positionen',
      line: (index: number, article: string) => `Position ${index}: ${article}`,
      remove: 'Entfernen',
      removeOf: (article: string) => `Entfernen, ${article}`,
      quantity: 'Menge',
      priceMode: 'Preis eingeben',
      perUnit: (unit: string) => `pro ${unit}`,
      perLine: 'als Betrag',
      price: 'Preis',
      total: 'Betrag der Zeile',
      derived: (price: string) => `= ${price}`,
      lastPrice: (price: string, change: string) => `Letzter Preis ${price} (${change})`,
      samePrice: (price: string) => `Wie beim letzten Mal: ${price}`,
      firstPrice: 'Der erste Preis für diesen Artikel. Er wird als letzter Preis gemerkt.',
      noPrice: (zero: string) => `Ohne Preis steht diese Charge mit ${zero} im Lagerwert.`,
      usesLast: (price: string) => `Ohne Angabe gilt der letzte Preis: ${price}`,
      higher: (change: string, price: string) =>
        `Der Preis liegt ${change} über dem letzten (${price}).`,
      lower: (change: string, price: string) =>
        `Der Preis liegt ${change} unter dem letzten (${price}).`,
      proposal: (days: number) =>
        days === 1 ? 'Vorschlag: Lieferung + 1 Tag' : `Vorschlag: Lieferung + ${days} Tage`,
      presets: { three: '3 Tage', week: '1 Woche', month: '1 Monat' },
      area: 'Lagerbereich',
      lotCode: 'Chargen-Nr.',
      addLotCode: 'Chargen-Nr. erfassen',
      addLotCodeOf: (article: string) => `Chargen-Nr. erfassen, ${article}`,
      value: (amount: string) => `Wert ${amount}`,
      none: 'Noch keine Position. Wähle unten den ersten Artikel.',
    },
    add: {
      title: 'Zeile hinzufügen',
      article: 'Artikel suchen',
      hint: 'Preis, Datum und Lagerbereich sind Vorschläge. Es gilt, was auf Lieferschein und Packung steht.',
    },
    check: {
      title: 'Kontrolle an der Tür',
      temperature: 'Temperatur',
      temperatureHint: 'Gemessen an der Ware. Der Wert kommt in die Selbstkontrolle.',
      ok: 'Ware in Ordnung',
      okText: 'Verpackung, Aussehen und Datum stimmen.',
      note: 'Bemerkung',
      refusedHint: 'Halte in der Bemerkung fest, was nicht stimmt und was du getan hast.',
    },
    needLine: 'Füge mindestens einen Artikel hinzu.',
    summary: (count: number, amount: string) => `${lots(count)}, ${amount}`,
    submit: 'Wareneingang buchen',
    submitOpening: 'Anfangsbestand buchen',
    done: (count: number, amount: string) => `${lots(count)} gebucht, ${amount}`,
    booked: (count: number, amount: string) =>
      `Gebucht: ${lots(count)}, ${amount}. Das Formular ist bereit für die nächste Lieferung.`,
  },

  count: {
    title: 'Inventur',
    subtitle:
      'Zähle, was da ist. Ein leeres Feld heisst nicht gezählt, die Charge bleibt dann, wie sie ist.',
    print: 'Zählblatt drucken',
    area: 'Lagerbereich',
    allAreas: 'Alle',
    date: 'Gezählt am',
    today: 'heute',
    yesterday: 'gestern',
    expected: (quantity: string) => `erwartet ${quantity}`,
    counted: 'Gezählt',
    countedOf: (article: string, detail: string) => `Gezählt, ${article}, ${detail}`,
    matches: 'stimmt',
    matchesOf: (article: string, detail: string) => `stimmt, ${article}, ${detail}`,
    difference: (quantity: string, amount: string) => `Differenz ${quantity}, ${amount}`,
    noDifference: 'Keine Differenz',
    found: {
      title: 'Nicht aufgeführt',
      hint: 'Ware, die da liegt, aber auf keiner Charge steht.',
      add: 'Gefundenes erfassen',
      sheetTitle: 'Gefundenes erfassen',
      article: 'Artikel',
      area: 'Lagerbereich',
      quantity: 'Menge',
      date: 'Datum auf der Packung',
      confirm: 'Hinzufügen',
      remove: 'Entfernen',
      removeOf: (article: string) => `Entfernen, ${article}`,
      row: (quantity: string, area: string) => `${quantity} · ${area}`,
      none: 'Nichts erfasst.',
      listLabel: 'Gefundene Ware',
    },
    note: 'Bemerkung',
    summary: (counted: number, total: number, amount: string) =>
      `${counted} von ${total} gezählt, Differenz ${amount}`,
    summaryFound: (counted: number, total: number, found: number, amount: string) =>
      `${counted} von ${total} gezählt, ${found} gefunden, Differenz ${amount}`,
    nothingCounted: 'Zähle mindestens eine Charge oder erfasse Gefundenes.',
    submit: 'Inventur abschliessen',
    confirm: {
      title: 'Inventur abschliessen?',
      counted: (counted: number, uncounted: number) =>
        uncounted === 0
          ? `${lots(counted)} gezählt.`
          : `${lots(counted)} gezählt. ${lots(uncounted)} nicht gezählt, sie bleiben unverändert.`,
      differences: 'Differenzen',
      none: 'Alles stimmt mit dem Bestand überein. Die Inventur wird ohne Korrektur festgehalten.',
      line: (article: string, quantity: string, amount: string) =>
        `${article}: ${quantity}, ${amount}`,
      foundLine: (article: string, quantity: string, amount: string) =>
        `${article}, gefunden: ${quantity}, ${amount}`,
      more: (count: number) =>
        count === 1 ? 'und 1 weitere Differenz' : `und ${count} weitere Differenzen`,
      total: (amount: string) => `Differenz gesamt ${amount}`,
      action: 'Abschliessen',
    },
    done: (amount: string) => `Inventur abgeschlossen, Differenz ${amount}`,
    emptyTitle: 'Nichts zu zählen',
    emptyText: 'In diesem Lagerbereich liegt keine Charge. Gefundenes kannst du trotzdem erfassen.',
    sheet: {
      title: 'Zählblatt',
      meta: (business: string, date: string) => `${business} · ${date}`,
      article: 'Artikel',
      date: 'Datum',
      spot: 'Platz',
      expected: 'Soll',
      counted: 'Gezählt',
      signature: 'Gezählt von',
    },
  },

  journal: {
    title: 'Journal',
    subtitle: 'Jede Bewegung im Lager, die neuste zuerst.',
    print: 'Drucken',
    period: {
      label: 'Zeitraum',
      week: '7 Tage',
      month: '30 Tage',
      calendar: 'Monat',
    },
    type: 'Art',
    allTypes: 'Alle',
    answer: (count: number, from: string, to: string) =>
      count === 1
        ? `1 Bewegung vom ${from} bis ${to}.`
        : `${count} Bewegungen vom ${from} bis ${to}.`,
    sums: 'Summen je Art',
    limited: (shown: number, total: number) =>
      `Gezeigt sind die neusten ${shown} von ${total} Bewegungen. Grenze Zeitraum oder Art ein.`,
    empty: 'In diesem Zeitraum gibt es keine Bewegung.',
    printMeta: (business: string, from: string, to: string) => `${business} · ${from} bis ${to}`,
  },

  movements: {
    caption: 'Lagerbewegungen',
    day: 'Tag',
    article: 'Artikel',
    type: 'Art',
    quantity: 'Menge',
    value: 'Wert',
    who: 'Wer',
    note: 'Bemerkung',
    purposes: {
      production: 'Produktion',
      sale: 'Verkauf',
      kitchen: 'Küche',
      staff: 'Personal',
    },
    count: 'Inventur',
    opening: 'Anfangsbestand',
    detail: (type: string, detail: string) => `${type} · ${detail}`,
    unknown: '–',
  },
} as const;
