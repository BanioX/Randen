# Randen – Stand und Plan

> **Stand 17.11.2026:** Version 0.1.0 im Aufbau. Gebaut sind Fundament, Design, UI-Kit (Design-Stufe 2 im Kit), Werkzeuge, Artikel, Lager, Rezepte mit Kalkulation, Betriebsarten und Funktionen, Cockpit, Preisänderung, Einkauf, Produktion und Menüplan, Speisekarte, Zahlen, Selbstkontrolle, Betrieb mit Sicherung und der Demo-Betrieb. Drucken und Sichern laufen seit dem 17.11.2026 auch in der installierten App auf iPhone und iPad (Speisekarte als PDF, die übrigen Druckseiten folgen). In Arbeit sind die Korrektur der bekannten Fehler ([`fehler.md`](fehler.md)), die Design-Stufe 2 auf den Seiten, App und Desktop, Verkauf und Auslieferung. Für die Suite mit Rettich liegt ein Entwurf vor (ADR-0020).

Dieses Dokument sagt, was gebaut ist, was gerade entsteht und was danach kommt. Entscheide stehen in den [ADRs](adr/README.md), Regeln in [`regeln.md`](regeln.md).

## Gebaut

| Teil | Inhalt |
| --- | --- |
| Fundament | Monorepo wie Rettich (pnpm, TypeScript strict, ESLint, Vitest, Vite, React, Tailwind, Dexie) |
| Modell | Betrieb, Team, Lagerbereiche und Plätze, Artikel und Lieferanten, Chargen und Lagerbewegungen, Wareneingang, Bestellung, Inventur, Rezept und Produktion, Speisekarte und Menüplan, Verkauf und Budget, Temperaturen und Reinigungsplan |
| Rechenregeln | Einheiten und Stückpreise, Ablauf und FEFO, Kalkulation mit Ausbeute, Mehrwertsteuer, Wareneinsatz, Deckungsbeitrag und Preisvorschlag, Deklaration von Allergenen, Diät und Herkunft durch alle Eigenproduktionen, Bedarf eines Rezepts, Menu-Engineering, Break-even |
| Preisänderung durchrechnen | Was ein neuer Einkaufspreis eines Artikels mit den Gerichten macht: Wareneinsatz und Ampel vorher und nachher, mit denselben Regeln wie die Rezeptkarte. Nur lesend, nichts wird gespeichert (ADR-0016) |
| Lager-Ledger | Eingang, Verbrauch nach FEFO, Abschreiben, Inventur, Verschieben; jede Mengenänderung als Bewegung; Eigenschaftstest über beliebige Buchungsfolgen |
| Schnittstelle | Befehle und Abfragen mit Zod, pro Modul; Idempotenz, Domain Events, JSON Schema |
| App-Rahmen | IndexedDB-Adapter, `useQuery` und `useCommand`, Tab-Leiste mit fünf Zielen unter 768 px, schmale Leiste in Traube auf dem iPad hochkant (768 bis 1023 px), Seitenleiste ab 1024 px, Pfade, Textkataloge mit Test auf «du» und «ss» |
| Design | Rotwein, Traube, Kork; hell und dunkel; 118 Farbpaare bewiesen (`pnpm contrast`); App-Symbol; Entwurf in [`design/`](design/) |
| UI-Kit | Felder für Menge, Geld, Stückpreis, Prozent, Temperatur, Datum und Foto; Auswahlfelder; Seitenkopf, Listen, Tabelle, Sheet, Toast, Badges, sechs Diagramm-Arten; Styleguide unter `/styleguide`. Design-Stufe 2 im Kit (16.11.2026): Kennzahlen stehen auf einer Linie und füllen ihre Reihe, «heute zu tun» in Rotwein und Zinnober nur für Falsches, Ladezustand statt ausgegrauter Knöpfe, Löschen als Umriss und gefüllt nur im Bestätigungsdialog, ruhigere dunkle Flächen |
| Werkzeuge | `pnpm check`, E2E mit axe auf iPhone, iPad und Web (hell und dunkel), Vorschaubilder in vier Ansichten, CI, Register der Nebenwirkungen mit Test, Cloudflare-Vorschau |
| Artikel und Lieferanten | Stammdaten mit Allergenen, Herkunft, Ausbeute, Mindest- und Sollbestand; «Mehrere auf einmal»; Preisverlauf |
| Lager | Bestand nach Charge, Ablauf zuerst, Wareneingang mit Kontrolle an der Tür, Abschreiber, Entnahme, Verschieben, Inventur, Journal |
| Betriebsarten und Funktionen | 14 Betriebsarten, 11 schaltbare Funktionen, «Randen einrichten» mit Fragen nach Betriebsart, Ware, Team und Ort des Essens; «Betrieb › Funktionen»; Ansicht pro Gerät; Modell für Menülinien, Mahlzeiten, Tellerrücklauf, Märkte (ADR-0015) |
| Einkauf | Einkaufsliste für den Markt, Bestellvorschlag je Lieferant, Bestellungen, Einkauf im Markt mit Beleg, der aufgehen muss (Depot, Privates, Rabatt), Preisbeobachtung (ADR-0015) |
| Produktion und Menüplan | Produktionsläufe mit Charge und Etikett, Menüplan mit Menülinien und Allergenen je Tag, Woche füllen, Mahlzeiten zählen, Tellerrücklauf in Gramm (ADR-0015) |
| Speisekarte | Karten aus den Rezepten mit Abschnitten, Preisen, Fotos und offenen Punkten; veröffentlichen oder zurück in den Entwurf; Allergenmatrix und Liste für das Personal; Gästeansicht im Vollbild mit Filtern in der Adresse; Export als eigenständige HTML-Datei ohne Skript (ADR-0018, Funktion Speisekarte) |
| Zahlen | Übersicht mit Zeitraum, Einkauf, Wareneinsatz, Abschreiber nach Art und Grund, Budget pro Monat, Break-even, Monatsbericht; Wareneinsatz im Cockpit und in den Zahlen nach einer Regel (`domain/meals.ts`); die Definition des Wareneinsatzes pro Mahlzeit bleibt offen (TD-27) |
| Selbstkontrolle | Temperaturen mit Richtwerten und Massnahme bei Abweichung, Reinigungsplan mit Standardplan, Heute, Bericht für die Kontrolle mit Druckansicht; das Verlaufsdiagramm nur in «Erweitert» |
| Drucken und Sichern (ADR-0019) | Am Computer und im Safari-Tab der Druckdialog; in der installierten App auf iPhone und iPad, wo `window.print()` seit iOS 27 nichts tut, ein PDF auf dem Gerät, das ins Teilen-Blatt geht («Drucken», «In Dateien sichern»). Alle 13 Druckknöpfe laufen über einen Weg; die Speisekarte für Gäste ist das erste PDF. Sicherung und Export gehen dort ebenfalls übers Teilen-Blatt und gelten erst als gesichert, wenn die Datei weitergegeben ist. jsPDF wird nur bei Bedarf geladen |
| Betrieb, Team, Sicherung | Betrieb bearbeiten, Team, Sicherung mit optionalem Passwort und Wiederherstellen mit Prüfung, Alles löschen, Über Randen (ADR-0017) |
| Cockpit | Heute: was verfällt, was heute fällig ist, Temperaturen, Selbstkontrolle, Mindestbestand; Lagerwert, Weggeworfen diesen Monat, Suche über Artikel, Rezepte, Lieferanten und Plätze; Erfassen nach Funktionen (ADR-0015) |
| Doku | Entscheide 0001 bis 0020 (0017 und 0020 als Entwurf zur Bestätigung durch Alban), bekannte Fehler ([`fehler.md`](fehler.md)), Regeln für Texte und Screens, Fakten mit Quellen, Glossar, Schulden, Lernbuch, Vorschau-Links |

## In Arbeit

| Teil | Inhalt |
| --- | --- |
| Druck-PDFs für die übrigen Seiten | In der installierten App auf iPhone und iPad zeigen zehn Druckseiten (Rezeptkarte, Bericht der Selbstkontrolle, Allergenmatrix, Etikett, Produktionsplan, Rundgang, Monatsbericht, Journal, Zählblatt, Bestellung) einen Hinweis statt eines stummen Knopfs; ihr PDF folgt (TD-56). Noch auf einem echten iPhone zu prüfen: Teilen-Blatt mit «Drucken», Sicherung in zwei Tipps, PDF offline (TD-40) |
| Bekannte Fehler | 30 bestätigte Befunde, 29 davon aus dem Code-Review vom 16.11.2026, vier mit hohem Risiko (Allergene beim Import, Märkte nur über die Demo, Wochenbedarf mit abgelaufener Ware, Demo löscht eigene Aufzeichnungen); neun warten auf die Gegenprüfung, einer davon mit hohem Risiko (das Formular «Betrieb» kann das Einrichten zurücksetzen). «Drucken» auf dem iPhone ist teilweise behoben (G-01) ([`fehler.md`](fehler.md)) |
| Design-Stufe 2 auf den Seiten | Das Kit ist gebaut; fünf Pakete folgen: Cockpit und Rahmen, Lager und Einkauf, Rezepte mit Plan und Produktion, Zahlen und Speisekarte, Selbstkontrolle und Betrieb |
| App und Desktop | Aus der Prüfung vom 16.11.2026: Fenstertitel je Seite, Hinweis auf eine neue Version, Anleitung zum Installieren, Erinnerung an die erste Sicherung, Druckseiten mit eigenem Seitenformat, Rückweg oben in der Gästeansicht, breiterer Inhalt auf grossen Bildschirmen, Tastenkürzel |
| Module, Welle 3 | Verkauf mit Slot (Mittag, Abend; offen, TD-26) · Auslieferung an Aussenstellen und Anlässe mit Lieferschein und Etikett |
| Demo-Betrieb | Gebaut. Die Auslieferung (`/dispatch`) zeigt noch einen Platzhalter; die Verweise auf Verkäufe, Margen und Menu-Engineering führen auf «Nicht gefunden», bis das Modul Verkauf gebaut ist (TD-44, F-30 in [`fehler.md`](fehler.md)) |

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
| MWST im Wareneinsatz | Betriebe ohne MWST-Pflicht oder mit Saldosteuersatz tragen die MWST als Kosten. Soll ihr Wareneinsatz mit MWST rechnen? Braucht vorher eine Quelle in `fakten.md` (ADR-0015) |
| «Menu» oder «Menü» | In der Schweizer Gastronomie ist «Menu» üblich, die App schreibt heute «Menü» (ADR-0015) |
| Begriffe für kleine Betriebe | «Abschreiber», «Wareneinsatz» und «Mindestbestand» erklären oder ersetzen, etwa durch «Weggeworfen», «Warenkosten» und «Nachkaufen ab» (ADR-0015). Bis dahin erklärt die App die Begriffe |
| Wareneinsatz pro Mahlzeit | Was zählt: der ganze Verbrauch des Monats oder nur die Mittag-Linien? Solange offen zeigt die Demo kein Ziel pro Mahlzeit (TD-27) |
| Verkäufe mit Slot | Bekommt ein Verkauf Mittag oder Abend? Ohne Slot zählen die Mahlzeiten einer Linie auch die Abendportionen desselben Gerichts (TD-26) |
| MWST 2.6 % für Mitnehmen | Die Abgrenzung der Belege nach `fakten.md` 3.2 fehlt in ADR-0015 (Zeile 66) und in der App (TD-25) |
| Domain | Nicht gekauft; kostet Geld. Wofür sie dient: «Adressen der Suite» (ADR-0020) |
| Marke und Name der Firma | Offen. Vorschläge mit einer ersten Prüfung in Handelsregister und Adressen: [`intern/firmenname.md`](intern/firmenname.md) (vorn Mangetout, Nachlese, Restanz); bis zum Entscheid «die Firma». Vorschlag: Die Produkte führen, die Firma ist ruhiger Absender nur unter «Über …», auf ihrer Startseite und in rechtlichen Texten; Namensmuster Schweizer Gartengemüse mit einer Leitfarbe (ADR-0020, Entwurf) |
| Adressen der Suite | Heute je Produkt eine eigene Adresse `<app>.<konto>.workers.dev`; Projekt- und Kontonamen bleiben. Vorschlag: mit einer Domain die Startseite auf `<domain>`, die Produkte auf Unteradressen. Die Adresse von Randen muss vor dem ersten Pilotbetrieb feststehen (ADR-0020) |
| Startseite der Firma sichtbar | Entwurf in `docs/intern/suite/`, nicht ausgeliefert und nicht in `wrangler.jsonc`, bis Alban Randen zeigen will (ADR-0020) |
| Desktop und Stores | Gebaut ist die PWA, aus dem Browser installiert, mit dem Rahmen ab 1024 px. App Store und Google Play kosten Geld, der Microsoft Store laut Microsoft keine Registrierungsgebühr; Beträge mit Quellen in `docs/intern/suite.md` (ADR-0020) |
| Cloudflare-Vorschau | Projekt `randen` eingerichtet (15.11.2026). Seit 17.11.2026 gilt: eine Version überall, `main` und der Arbeits-Branch auf demselben Commit. Im Dashboard umzustellen: Production branch `main`, Preview Builds aus ([`previews.md`](previews.md)) |
| Sicherung: Format und Verschlüsselung | Gebaut nach dem Entwurf ADR-0017: eine JSON-Datei des ganzen Betriebs, auf Wunsch mit Passwort verschlüsselt (PBKDF2 mit 600'000 Runden, AES-GCM mit 256 Bit). Datenformat und Verschlüsselung entscheidet Alban; bis dahin bleibt das ADR ein Entwurf |
