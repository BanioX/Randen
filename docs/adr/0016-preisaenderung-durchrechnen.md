# ADR-0016: Preisänderung durchrechnen

- **Status:** angenommen
- **Datum:** 2026-11-15
- **Entscheid von:** Claude, als kleiner Entscheid nach [CLAUDE.md](../../CLAUDE.md), Arbeitsweise 1. Alban kann ihn ändern.
- **Betrifft:** [ADR-0008](0008-computed-not-stored.md) (berechnet, nie gespeichert), [ADR-0015](0015-betriebsarten-und-funktionen.md) (Funktionen)

## Kontext

Eine Köchin fragt: Was passiert mit meinen Gerichten, wenn die Butter 15 % teurer wird? Heute beantwortet Randen das nur mit Umwegen: Preis im Artikel ändern, im Rezeptbuch nachsehen, zurücksetzen. Dabei entsteht eine Buchung im Verlauf des Artikels, die nichts mit einer echten Preisänderung zu tun hat, und die Antwort fehlt, bevor der Preis überhaupt steht.

## Entscheid

**Eine Frage, kein Eingriff.** «Preisänderung durchrechnen» liest die heutigen Kosten und rechnet eine Änderung eines Artikelpreises durch. Es schreibt nichts: keine Zeile, keine Bewegung, kein Ereignis, nichts an Dritte. Das Ergebnis wird nie gespeichert, auch nicht als Entwurf. Es gibt keinen Knopf «Übernehmen». Wer den Preis ändern will, tut es im Artikel.

**Kern, keine Funktion.** Die Rechnung gehört zum Rezept: Wareneinsatz, Deckungsbeitrag und Ampel sind Teil des Rezeptbuchs, das jede Küche hat. Darum ist die Abfrage Teil des Moduls `recipes`, ohne `useModule`, und der Einstieg steht als sekundärer Knopf auf der Rezeptliste. Die Auswertung hat keinen Schalter «Erweitert» (ADR-0015).

**Dieselben Regeln wie die Rezeptkarte.** Die Kosten kommen aus `recipeCost`, Anteil und Ampel aus `dishFigures`. Eine Komponente folgt wie auf der Karte nur dann ihrem Rezept, wenn sie keinen gespeicherten Produktionspreis hat (`effectiveUnitPrice`). Hat sie einen, zeigt die Rechnung wie die Karte keine Änderung in den Gerichten dahinter.

**Reine Regel im Kern.** `priceChangeImpact` in `packages/core/src/domain/price-change.ts` bekommt das Buch und die Gerichte und gibt Zahlen zurück. Das Buch wird nicht verändert: die neue Preisliste ist eine Kopie mit einem geänderten Artikel.

**Die Abfrage `recipes.priceChange`.** Eingabe: der Artikel und die Änderung in Basispunkten (1500 ist +15 %, −1000 ist −10 %, zulässig von −90 % bis +300 %). Der neue Preis ist `round(alter Preis × (10000 + Änderung) ÷ 10000)` in Rappen pro 1000 Basiseinheiten, nie unter 1.
- Unbekannter Artikel: `not_found`.
- Artikel ohne Preis: `invalid` mit dem Satz «Der Artikel hat noch keinen Preis, darum lässt sich nichts durchrechnen.». Ein Preis von 0 heisst «kein Preis», darum rechnet die Abfrage nichts durch, statt eine schöne Zahl zu zeigen (ADR-0008).
- Nur aktive Gerichte zählen, wie in der Rezeptliste «Alle». Die Antwort enthält nur die Gerichte, die den Artikel verwenden, nach Name sortiert, und die Zählung «verwenden», «schlechter», «besser».

**Komponenten sind keine Zeilen.** Eine Komponente zeigt ihre Kosten nur über die Gerichte, die sie verwenden. Die Seite listet Gerichte.

**Status.** «Schlechter» heisst: von im Ziel auf knapp darüber oder darüber, oder von knapp darüber auf darüber. «Besser» ist das Gegenteil. Gerichte ohne Verkaufspreis haben keinen Status und zählen in keine der beiden Richtungen.

**Seite.** `/recipes/price-change`, Muster H2 (Detail mit Eingabe oben) aus [regeln.md](../regeln.md). Die Ergebnisse erscheinen, sobald Artikel und Änderung gesetzt sind. Es gibt keinen Absenden-Knopf. Die Änderung kommt mit Vorzeichen-Knopf «Minus, Preisänderung», weil die Zahlentastatur des Telefons kein Minus hat (wie bei der Temperatur).

## Nicht gewählt

- **Gespeicherte Szenarien** («Was wäre, wenn…» als Liste): würden Daten speichern und bräuchten einen eigenen Entscheid über Löschen und Historie. Später, falls der Betrieb danach fragt.
- **Ampel-Warnung beim Ändern des Artikelpreises**: wäre ein Eingriff in den Artikel und eine neue Auswertung. Nicht jetzt.
- **Eine eigene Funktion**: würde die Frage an Betriebsarten knüpfen. Jede Küche hat Rezepte und fragt nach ihrem Wareneinsatz.

## Nebenwirkungen

Keine. Die Seite speichert nichts, sendet nichts und lädt nichts. `docs/nebenwirkungen.md` bleibt unverändert.

## Folgen

- Eine Komponente mit gespeichertem Produktionspreis folgt der Änderung nicht (Schuld TD-24).
- Die Zahlen sind so genau wie die Preise. Der Betrieb muss den Preis im Artikel aktuell halten, wie für jede Kalkulation.
- Die Tests prüfen die Zahlen von Hand (`packages/core/test/price-change.test.ts`) und den Schreibschutz der Abfrage (`recipes-price-change.test.ts`).
