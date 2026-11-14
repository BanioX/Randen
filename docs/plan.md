# Randen – Stand und Plan

> **Stand 15.11.2026:** Version 0.1.0 im Aufbau. Fundament, Design, UI-Kit und Werkzeuge stehen; Artikel, Lieferanten und Lager sind gebaut, die weiteren Module in Arbeit.

Dieses Dokument sagt, was gebaut ist, was gerade entsteht und was danach kommt. Entscheide stehen in den [ADRs](adr/README.md), Regeln in [`regeln.md`](regeln.md).

## Gebaut

| Teil | Inhalt |
| --- | --- |
| Fundament | Monorepo wie Rettich (pnpm, TypeScript strict, ESLint, Vitest, Vite, React, Tailwind, Dexie) |
| Modell | Betrieb, Team, Lagerbereiche und Plätze, Artikel und Lieferanten, Chargen und Lagerbewegungen, Wareneingang, Bestellung, Inventur, Rezept und Produktion, Speisekarte und Menüplan, Verkauf und Budget, Temperaturen und Reinigungsplan |
| Rechenregeln | Einheiten und Stückpreise, Ablauf und FEFO, Kalkulation mit Ausbeute, Mehrwertsteuer, Wareneinsatz, Deckungsbeitrag und Preisvorschlag, Deklaration von Allergenen, Diät und Herkunft durch alle Eigenproduktionen, Bedarf eines Rezepts, Menu-Engineering, Break-even |
| Lager-Ledger | Eingang, Verbrauch nach FEFO, Abschreiben, Inventur, Verschieben; jede Mengenänderung als Bewegung; Eigenschaftstest über beliebige Buchungsfolgen |
| Schnittstelle | Befehle und Abfragen mit Zod, pro Modul; Idempotenz, Domain Events, JSON Schema |
| App-Rahmen | IndexedDB-Adapter, `useQuery` und `useCommand`, Seitenleiste ab 1024 px und fünf Tabs darunter, Pfade, Textkataloge mit Test auf «du» und «ss» |
| Design | Rotwein, Traube, Kork; hell und dunkel; 104 Farbpaare bewiesen (`pnpm contrast`); App-Symbol; Entwurf in [`design/`](design/) |
| UI-Kit | Felder für Menge, Geld, Stückpreis, Prozent, Temperatur, Datum und Foto; Auswahlfelder; Seitenkopf, Listen, Tabelle, Sheet, Toast, Badges, sechs Diagramm-Arten; Styleguide unter `/styleguide` |
| Werkzeuge | `pnpm check`, E2E mit axe auf iPhone, iPad und Web (hell und dunkel), Vorschaubilder in vier Ansichten, CI, Register der Nebenwirkungen mit Test, Cloudflare-Vorschau |
| Artikel und Lieferanten | Stammdaten mit Allergenen, Herkunft, Ausbeute, Mindest- und Sollbestand; «Mehrere auf einmal»; Preisverlauf |
| Lager | Bestand nach Charge, Ablauf zuerst, Wareneingang mit Kontrolle an der Tür, Abschreiber, Entnahme, Verschieben, Inventur, Journal |
| Doku | Entscheide 0001 bis 0013, Regeln für Texte und Screens, Fakten mit Quellen, Glossar, Schulden, Lernbuch, Vorschau-Links |

## In Arbeit

| Teil | Inhalt |
| --- | --- |
| Module, Welle 1 | Wo ist was? mit Fotos und Rundgang · Rezepte mit Kalkulation, Deklaration und Kochansicht |
| Module, Welle 2 | Produktion und Menüplan mit «Reste verwerten» · Speisekarte mit Gästeansicht · Einkauf mit Bestellvorschlag · Verkäufe, Margen, Menu-Engineering · Zahlen mit Budget, Break-even, Abschreiber nach Art, Monatsbericht · Cockpit · Selbstkontrolle · Betrieb, Team, Sicherung · Demo-Betrieb |

## Danach

- **Lieferschein lesen:** Foto oder PDF des Lieferscheins wird zum Wareneingang, mit der Texterkennung aus Rettich (tesseract.js und pdf.js, selbst gehostet). Der Parser für Grosshandels-Lieferscheine ist neu.
- **Etiketten** für Eigenproduktion mit Code zum Scannen.
- **Barcode** am Wareneingang und bei der Inventur.
- **Klimabilanz** der Abschreiber, wie bei Rettich.
- **Mehrere Sprachen** für gemischte Küchenteams.

## Offene Entscheide von Alban

| Thema | Stand |
| --- | --- |
| «du» oder «Sie» | Gebaut ist «du» (ADR-0010); ein Wechsel betrifft nur die Textkataloge |
| Server und Sync | Gebaut ist ein Gerät pro Küche ohne Server (ADR-0006). Mehrere Geräte brauchen Konten und Sync: kostet und lässt Daten das Gerät verlassen |
| Speisekarte im Netz mit QR-Code | Nicht gebaut (ADR-0011): braucht eine öffentliche Adresse |
| Domain | Nicht gekauft; kostet Geld |
| Cloudflare-Vorschau | Projekt `randen` eingerichtet (15.11.2026), Production vorläufig auf dem Arbeits-Branch ([`previews.md`](previews.md)) |
