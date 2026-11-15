# ADR-0014: Grundfunktionen zuerst, alles Weitere zum Einschalten

- **Status:** angenommen, teilweise ersetzt durch [ADR-0015](0015-betriebsarten-und-funktionen.md): Die Gruppen sind jetzt Funktionen des Betriebs; «Erweitert» bleibt als Ansicht pro Gerät und zeigt die Tiefe, nicht mehr die Funktionen. Speisekarte und Bestellvorschlag sind seither schaltbar.
- **Datum:** 2026-11-15
- **Entscheid von:** Claude, nach Albans Wunsch (15.11.2026): «Ziel ist, Nutzer nicht mit Features zu erschlagen. Wer mehr Infos, mehr Dashboards will, kann es erweitern. Für Nerds und Buchhalter, aber der einfache Nutzer wird nicht überfordert.» Übernommen aus Rettich (ADR-0095, PR #341) und an die Küche angepasst.

## Kontext

Randen deckt viel ab: Lager, Artikel, Rezepte, Produktion, Menüplan, Speisekarte, Einkauf, Zahlen, Selbstkontrolle, Plätze mit Fotos, Team. Wer allein einen Imbiss führt, braucht davon einen Teil jeden Tag und den Rest nie. Wer eine Brigade führt oder die Buchhaltung macht, will alles.

## Entscheid

1. **Grundfunktionen** sind, was jede Küche jeden Tag braucht: Cockpit, Lager mit Wareneingang, Ablauf, Abschreiber und Inventur, Artikel und Lieferanten, Rezepte mit Wareneinsatz, Marge und Allergenen, Speisekarte, Einkauf mit Bestellvorschlag, Selbstkontrolle. Die Selbstkontrolle ist Pflicht für jeden Betrieb und deshalb immer dabei.
2. **Erweitert** ist ein Schalter unter **Betrieb › Funktionen**. Ist er an, lassen sich vier Gruppen einzeln schalten:

   | Gruppe | Kennung | Was dazugehört |
   | --- | --- | --- |
   | Wo ist was? | `places` | Plätze mit Fotos, Rundgang für neue Mitarbeitende |
   | Produktion und Menüplan | `production` | Eigenproduktion mit Etikett, Wochenplan, «Reste verwerten» |
   | Zahlen und Auswertung | `numbers` | Budget, Break-even, Margen, Menu-Engineering, Verkäufe, Journal, Monatsbericht, Diagramme im Cockpit |
   | Team | `team` | Mitarbeitende, wer an diesem Gerät arbeitet, «wer» an Buchungen |

3. **Wer startet womit:** Ein Betrieb, der auf diesem Gerät neu entsteht, beginnt mit den Grundfunktionen. Fehlt die Wahl oder ist sie unlesbar, zeigt Randen alles: Niemand verliert eine Funktion aus Versehen.
4. **Ausblenden heisst ausblenden:** Nur die Einstiege verschwinden (Navigation, Zeilen, Knöpfe, Abschnitte). Die Daten bleiben, rechnen weiter mit (zum Beispiel Abschreiber im Lager) und sind in der Sicherung. Eine gespeicherte Adresse öffnet die Seite weiterhin.
5. **Pro Gerät:** Die Wahl ist eine Anzeige, keine Betriebsdaten. Sie liegt im `localStorage` (`randen:extras`, SE-13), nicht in der Sicherung. So kann das Tablet am Pass einfach bleiben und der Rechner im Büro alles zeigen.
6. **Im Code:** `apps/web/src/app/extras.ts` (`useExtra('numbers')`), Navigationseinträge tragen `extra`. Seiten blenden ihre erweiterten Teile mit `useExtra` aus.

## Konsequenzen

- Jede neue Funktion ist ausdrücklich Grundfunktion oder gehört in eine Gruppe; die Definition of Done fragt danach.
- Tests sehen standardmässig alles (ohne gespeicherte Wahl). Wer die Grundfunktionen prüft, setzt die Wahl mit `writeExtras(ESSENTIALS)`.
- Die Namen «Grundfunktionen» und «Erweitert» sind dieselben wie bei Rettich, damit beide Produkte gleich sprechen.
