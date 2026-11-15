import type { OrderStatus, PurchaseReason, ReceiptAmountKind, ShoppingReason } from '@randen/core';

const plural = (count: number, one: string, many: string) =>
  `${String(count)} ${count === 1 ? one : many}`;

const STATUS: Record<OrderStatus, string> = {
  draft: 'Entwurf',
  sent: 'Bestellt',
  received: 'Erhalten',
  cancelled: 'Storniert',
};

const REASONS: Record<ShoppingReason | PurchaseReason, string> = {
  below_min: 'Unter Mindestbestand',
  plan: 'Für den Menüplan',
  both: 'Mindestbestand und Menüplan',
  missing: 'Fehlt',
  manual: 'Von Hand',
};

const AMOUNT_KINDS: Record<ReceiptAmountKind, string> = {
  deposit: 'Depot',
  deposit_return: 'Depot zurück',
  discount: 'Rabatt',
  private: 'Privat',
  not_stocked: 'Nicht an Lager',
};

/** Texts of «Einkauf» (de-CH, «ss», «du»). */
export const purchasingMessages = {
  title: 'Einkauf',
  back: 'Einkauf',
  status: STATUS,
  reasons: REASONS,
  none: '–',
  priceMissing: 'Preis fehlt',
  /** «heute», «morgen», «Mo, 16.11.» */
  weekdays: { mon: 'Mo', tue: 'Di', wed: 'Mi', thu: 'Do', fri: 'Fr', sat: 'Sa', sun: 'So' },
  today: 'heute',
  tomorrow: 'morgen',
  packs: (count: number, label: string | undefined, size: string) =>
    label === undefined ? `${String(count)} × ${size}` : `${String(count)} ${label} à ${size}`,

  overview: {
    subtitleOrdering: 'Was nachzukaufen ist, je Lieferant. Verschicken tust du selbst.',
    subtitleMarket: 'Deine Liste für den Markt und was du eingekauft hast.',
    orders: 'Bestellungen',
    record: 'Einkauf erfassen',
    horizon: 'Menüplan der nächsten',
    horizonOption: (days: number) => `${String(days)} Tage`,
  },

  proposal: {
    title: 'Bestellvorschlag',
    hint: (days: number) =>
      `Unter dem Mindestbestand und für den Menüplan der nächsten ${String(days)} Tage, abzüglich offener Bestellungen.`,
    hintNoPlan: 'Was unter den Mindestbestand fällt, abzüglich offener Bestellungen.',
    empty:
      'Es ist nichts nachzukaufen. Alles liegt über dem Mindestbestand, und der Menüplan ist gedeckt.',
    emptyHint:
      'Setz bei einem Artikel einen Mindestbestand, dann schlägt Randen vor, wann und wie viel du bestellst.',
    toArticles: 'Zu den Artikeln',
    withoutSupplier: 'Ohne Lieferant',
    withoutSupplierHint:
      'Gib diesen Artikeln einen Lieferanten, dann erscheinen sie in dessen Vorschlag.',
    market: 'Markt',
    marketHint:
      'Diese Ware holst du selbst. Schalte «Einkauf im Markt» ein, dann steht sie auf der Einkaufsliste.',
    orderBy: (day: string) => `Bestellen ${day}`,
    deliveredOn: (day: string) => `Lieferung ${day}`,
    noDays: 'Keine Bestelltage erfasst',
    stock: (stock: string) => `Bestand ${stock}`,
    min: (min: string) => `Mindestbestand ${min}`,
    plan: (need: string) => `Menüplan ${need}`,
    onOrder: (quantity: string) => `bestellt ${quantity}`,
    expiresBefore: (quantity: string) => `${quantity} laufen vor dem Menüplan ab`,
    quantityOf: (name: string) => `Menge ${name}`,
    lessOf: (name: string) => `Weniger ${name}`,
    moreOf: (name: string) => `Mehr ${name}`,
    leftOut: 'nicht bestellen',
    sum: 'Summe',
    minOrderMissing: (min: string, missing: string) =>
      `Mindestbestellwert ${min}: Es fehlen noch ${missing}.`,
    minOrderReached: (min: string) => `Mindestbestellwert ${min} erreicht.`,
    withoutPrice: (count: number) =>
      `${plural(count, 'Artikel', 'Artikel')} ohne Preis: Die Summe ist zu tief.`,
    create: 'Bestellung anlegen',
    createFor: (supplier: string) => `Bestellung anlegen bei ${supplier}`,
    nothingLeft: 'Setz mindestens eine Menge über 0.',
    created: (count: number, amount: string) =>
      `Bestellung angelegt: ${plural(count, 'Artikel', 'Artikel')}, ${amount}`,
    linesOf: (supplier: string) => `Vorschlag für ${supplier}`,
  },

  openOrders: {
    title: 'Offene Bestellungen',
    all: 'Alle Bestellungen',
    none: 'Keine offenen Bestellungen.',
    caption: 'Offene Bestellungen',
  },

  priceWatch: {
    title: 'Preisänderungen',
    hint: 'Letzter Einkauf gegenüber dem Einkauf davor, ab 5 %. Aktionen zählen nicht.',
    none: 'Keine Preisänderung ab 5 % seit dem Einkauf davor.',
    caption: 'Artikel mit geändertem Preis',
    change: (from: string, to: string) => `${from} → ${to}`,
    since: (date: string, supplier: string | undefined) =>
      supplier === undefined ? `Einkauf vom ${date}` : `Einkauf vom ${date}, ${supplier}`,
    dearer: (share: string) => `+${share}`,
    cheaper: (share: string) => `−${share}`,
    dishes: (count: number) => `Betrifft ${plural(count, 'Gericht', 'Gerichte')}`,
    noDishes: 'In keinem Gericht',
    dishesCaption: (name: string) => `Gerichte mit ${name}`,
    columns: {
      dish: 'Gericht',
      cost: 'Wareneinsatz pro Portion',
      share: 'Anteil am Preis',
    },
    costChange: (before: string, after: string) => `${before} → ${after}`,
    via: (component: string) => `über ${component}`,
    noPrice: 'ohne Preis',
    incomplete: 'Preis einer Zutat fehlt',
  },

  shopping: {
    title: 'Einkaufsliste',
    hint: 'Was unter den Mindestbestand fällt, was der Menüplan braucht und was fehlt, im Gang durch den Markt.',
    market: 'Markt',
    allMarkets: 'Alle Märkte',
    empty:
      'Die Einkaufsliste ist leer. Was unter den Mindestbestand fällt oder fehlt, erscheint hier.',
    add: 'Zeile hinzufügen',
    addTitle: 'Auf die Einkaufsliste',
    mode: 'Was',
    modes: { article: 'Artikel', text: 'Freier Text' },
    text: 'Text',
    textHint: 'Zum Beispiel Servietten oder Alufolie.',
    quantity: 'Menge',
    submitAdd: 'Hinzufügen',
    added: (name: string) => `${name} steht auf der Einkaufsliste`,
    already: (name: string) => `${name} stand schon auf der Einkaufsliste`,
    needArticle: 'Wähl einen Artikel aus der Liste.',
    tick: (name: string) => `${name} abhaken`,
    remove: 'Entfernen',
    removeOf: (name: string) => `${name} von der Liste nehmen`,
    removed: (name: string) => `${name} von der Liste genommen`,
    other: 'Weiteres',
    lastPrice: (price: string, market: string, date: string) =>
      `zuletzt ${price}, ${market}, ${date}`,
    stockLine: (stock: string, min: string | undefined) =>
      min === undefined ? `Bestand ${stock}` : `Bestand ${stock}, Mindestbestand ${min}`,
    progress: (checked: number, count: number) =>
      `${String(checked)} von ${String(count)} abgehakt`,
    otherMarkets: (count: number, market: string) =>
      `${plural(count, 'Zeile', 'Zeilen')} für ${market}`,
    record: 'Einkauf erfassen',
    caption: (group: string) => `Einkaufsliste, ${group}`,
  },

  record: {
    title: 'Einkauf erfassen',
    subtitle: 'Die Ware kommt ins Lager, der Beleg muss aufgehen.',
    notFound: 'Diesen Markt gibt es nicht mehr.',
    head: {
      title: 'Beleg',
      market: 'Markt',
      noMarket: 'Ohne Markt',
      date: 'Eingekauft am',
      document: 'Beleg-Nr.',
      total: 'Belegtotal',
      totalHint: 'Der Betrag unten auf dem Beleg.',
      customerCard: (number: string) => `Kundenkarte ${number}`,
    },
    lines: {
      title: 'Ware',
      none: 'Noch keine Ware. Hake auf der Einkaufsliste ab oder füg einen Artikel hinzu.',
      line: (index: number, name: string) => `Zeile ${String(index)}: ${name}`,
      mode: 'Erfasst als',
      modes: { quantity: 'Menge', packs: 'Kolli' },
      quantity: 'Menge',
      packs: 'Kolli',
      perPack: 'Einheiten pro Kolli',
      unitSize: 'Inhalt pro Einheit',
      packPrice: 'Preis pro Kolli',
      amount: 'Betrag',
      amountHint: 'Wie auf dem Beleg.',
      packsText: (packs: number, perPack: number, size: string, total: string) =>
        perPack === 1
          ? `${plural(packs, 'Kolli', 'Kolli')} à ${size} = ${total}`
          : `${plural(packs, 'Kolli', 'Kolli')} à ${String(perPack)} × ${size} = ${total}`,
      derived: (amount: string, price: string) => `Betrag ${amount}, ${price}`,
      perUnit: (price: string) => `ergibt ${price}`,
      last: (price: string) => `zuletzt ${price}`,
      promo: 'Aktion',
      promoText: 'Zählt nicht als Preis für die Kalkulation.',
      expires: 'Zu verbrauchen bis',
      expiresHint: (days: number) => `Vorschlag: ${plural(days, 'Tag', 'Tage')} ab heute`,
      area: 'Lagerbereich',
      remove: 'Entfernen',
      removeOf: (name: string) => `${name} entfernen`,
      add: 'Artikel hinzufügen',
      addHint: 'Wähl einen Artikel; Enter fügt ihn hinzu.',
    },
    amounts: {
      title: 'Weitere Beträge',
      hint: 'Was auf dem Beleg steht, aber nicht an Lager geht. Depot und Privates zählen nicht zum Wareneinsatz.',
      kinds: AMOUNT_KINDS,
      kind: 'Art',
      amount: 'Betrag',
      note: 'Notiz',
      add: 'Betrag hinzufügen',
      removeOf: (index: number) => `Betrag ${String(index)} entfernen`,
      row: (index: number) => `Betrag ${String(index)}`,
    },
    check: {
      title: 'Kontrolle',
      temperature: 'Temperatur bei der Übernahme',
      temperatureHint: 'Für Frischware aus dem Kühlregal.',
      photo: 'Foto des Belegs',
      photoHint: 'Das Foto bleibt auf diesem Gerät.',
      note: 'Notiz',
    },
    unassigned: (amount: string) => `Noch nicht zugeordnet: ${amount}`,
    overassigned: (amount: string) => `Zu viel zugeordnet: ${amount}`,
    addsUp: 'Der Beleg geht auf.',
    summary: (count: number, amount: string) => `${plural(count, 'Artikel', 'Artikel')}, ${amount}`,
    submit: 'Einkauf buchen',
    needLine: 'Füg mindestens einen Artikel hinzu.',
    done: (count: number, amount: string) =>
      `Einkauf gebucht: ${plural(count, 'Charge', 'Chargen')}, ${amount}`,
  },

  orders: {
    title: 'Bestellungen',
    filter: 'Stand',
    filters: {
      open: 'Offen',
      draft: 'Entwürfe',
      sent: 'Bestellt',
      received: 'Erhalten',
      cancelled: 'Storniert',
      all: 'Alle',
    },
    filterWithCount: (label: string, count: number) => `${label} (${String(count)})`,
    caption: 'Bestellungen',
    toProposal: 'Zum Bestellvorschlag',
    emptyTitle: 'Noch keine Bestellungen',
    emptyText: 'Der Bestellvorschlag zeigt, was nachzukaufen ist, und legt die Bestellung an.',
    noMatch: 'Keine Bestellung in diesem Stand.',
    lines: (count: number) => plural(count, 'Artikel', 'Artikel'),
    orderedOn: (date: string) => `bestellt am ${date}`,
    createdOn: (date: string) => `angelegt am ${date}`,
    expected: (day: string) => `Lieferung ${day}`,
  },

  order: {
    back: 'Bestellungen',
    notFound: 'Diese Bestellung gibt es nicht mehr.',
    subtitle: (status: string, date: string) => `${status}, ${date}`,
    markSent: 'Als bestellt markieren',
    sentDone: (supplier: string) => `Als bestellt markiert: ${supplier}`,
    receive: 'Wareneingang buchen',
    notice: {
      draft:
        'Kopiere, teile oder drucke den Text und verschick ihn selbst. Danach markierst du die Bestellung als bestellt.',
      sent: (date: string) =>
        `Bestellt am ${date}. Wenn die Ware kommt, buchst du den Wareneingang.`,
      received: 'Die Ware ist eingegangen und im Lager gebucht.',
      cancelled: 'Diese Bestellung ist storniert.',
    },
    kpi: {
      value: 'Wert',
      lines: 'Artikel',
      expected: 'Lieferung',
      ordered: 'Bestellt am',
      noDay: 'Kein Tag',
      notYet: 'Noch nicht',
      withoutPrice: 'ohne alle Preise',
    },
    lines: {
      title: 'Artikel',
      caption: 'Artikel der Bestellung',
      add: 'Artikel hinzufügen',
      addHint: 'Wähl einen Artikel; Enter fügt ihn hinzu.',
      remove: 'Entfernen',
      removeOf: (name: string) => `${name} entfernen`,
      articleNumber: (number: string) => `Art.-Nr. ${number}`,
      columns: { article: 'Artikel', quantity: 'Menge', price: 'Preis', value: 'Wert' },
      sum: 'Summe',
    },
    details: {
      title: 'Lieferung',
      expectedOn: 'Gewünschter Liefertag',
      nextDelivery: (day: string) => `Nächster Liefertag: ${day}`,
      note: 'Bemerkung',
      noteHint: 'Steht im Text der Bestellung.',
    },
    dirty: 'Sichere die Änderungen, dann stimmt der Text der Bestellung.',
    save: 'Änderungen sichern',
    discard: 'Verwerfen',
    saved: 'Gesichert',
    needLine: 'Eine Bestellung braucht mindestens einen Artikel.',
    text: {
      title: 'Text zum Verschicken',
      hint: 'Ohne Preise. Verschicken tust du selbst, per E-Mail oder Nachricht.',
      copy: 'Kopieren',
      copied: 'Text kopiert. Füg ihn in deine E-Mail oder Nachricht ein.',
      selected: 'Der Text ist markiert. Kopiere ihn mit dem Menü deines Geräts.',
      share: 'Teilen',
      print: 'Drucken',
    },
    supplier: {
      title: 'Lieferant',
      customerNumber: (number: string) => `Kundennummer ${number}`,
      phone: (phone: string) => `Telefon ${phone}`,
      email: (email: string) => `E-Mail ${email}`,
      open: 'Lieferant öffnen',
    },
    print: {
      title: (supplier: string) => `Bestellung an ${supplier}`,
      meta: (business: string, date: string) => `${business}, ${date}`,
      columns: { quantity: 'Menge', article: 'Artikel', number: 'Art.-Nr.' },
    },
    cancel: 'Stornieren',
    cancelTitle: 'Bestellung stornieren?',
    cancelText: (supplier: string) =>
      `Die Bestellung bei ${supplier} bleibt in der Liste, als storniert. Hast du sie schon verschickt, sag es dem Lieferanten selbst.`,
    cancelled: 'Bestellung storniert',
    remove: 'Entwurf löschen',
    removeTitle: 'Entwurf löschen?',
    removeText: (supplier: string) =>
      `Der Entwurf für ${supplier} verschwindet. Der Bestellvorschlag zeigt die Artikel wieder.`,
    removed: 'Entwurf gelöscht',
  },
} as const;
