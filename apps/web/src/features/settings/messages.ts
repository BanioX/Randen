/** Texts of «Betrieb» and «Mehr» (de-CH, «ss», «du»). */
export const settingsMessages = {
  more: {
    title: 'Mehr',
    business: 'Betrieb',
    features: 'Funktionen',
    featuresDetail: (on: boolean) => (on ? 'Erweitert' : 'Grundfunktionen'),
    demo: 'Demo-Betrieb',
    demoDetail: 'Eine eingerichtete Küche zum Ausprobieren',
  },
  features: {
    title: 'Funktionen',
    intro:
      'Randen zeigt zuerst, was eine Küche jeden Tag braucht: Lager, Wareneingang, Ablauf, Artikel, Rezepte mit Kalkulation, Speisekarte mit Allergenen, Einkauf und Selbstkontrolle. Alles Weitere schaltest du hier ein. Die Wahl gilt für dieses Gerät; ausgeblendete Bereiche behalten ihre Daten.',
    switchLabel: 'Erweitert',
    switchHint:
      'Zeigt die Bereiche unten. Ausschalten blendet sie wieder aus, ohne etwas zu löschen.',
    essentialsTitle: 'Immer dabei',
    essentials: [
      'Cockpit mit dem, was heute zu tun ist',
      'Lager mit Wareneingang, Ablauf, Abschreiber und Inventur',
      'Artikel und Lieferanten',
      'Rezepte mit Wareneinsatz, Marge und Allergenen',
      'Speisekarte mit Allergenen und Herkunft',
      'Einkauf mit Bestellvorschlag',
      'Selbstkontrolle mit Temperaturen und Reinigungsplan',
    ],
    groupsTitle: 'Erweitert',
    groups: {
      places: {
        title: 'Wo ist was?',
        detail: 'Plätze mit Fotos und ein Rundgang für neue Mitarbeitende',
      },
      production: {
        title: 'Produktion und Menüplan',
        detail: 'Eigenproduktion mit Etikett, Wochenplan, Reste verwerten',
      },
      numbers: {
        title: 'Zahlen und Auswertung',
        detail: 'Budget, Break-even, Margen, Menu-Engineering, Journal, Monatsbericht',
      },
      team: {
        title: 'Team',
        detail: 'Mitarbeitende, wer an diesem Gerät arbeitet, wer was gebucht hat',
      },
    },
  },
} as const;
