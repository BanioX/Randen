# ADR-0008: Allergene, Herkunft, Wareneinsatz und Marge werden berechnet, nie gespeichert

- **Status:** angenommen
- **Datum:** 2026-11-14

## Kontext

Eine Speisekarte, die bei den Allergenen danebenliegt, schadet Gästen. Eine Kalkulation mit alten Preisen täuscht den Betrieb. Beides passiert, wenn Angaben von Hand doppelt gepflegt werden.

## Entscheid

1. **Allergene stehen am Artikel** (enthalten, Spuren). Ein Gericht leitet seine Angaben aus den Zutaten ab, durch alle Eigenproduktionen hindurch (`declarationOf`). Das Rezept kann nur ergänzen, nie wegnehmen.
2. **Diät** (vegan, vegetarisch) folgt der schwächsten Zutat.
3. **Herkunft:** Fleisch und Fisch tragen ihr Herkunftsland am Artikel; die Speisekarte zeigt es je Gericht.
4. **Wareneinsatz, Deckungsbeitrag und Preisvorschlag** rechnen bei jedem Blick mit den aktuellen Preisen (`recipeCost`, `dishFigures`).
5. **Unvollständig heisst unvollständig:** Fehlt ein Preis, eine Zutat oder eine Herkunft, sagt die App das (`missingPrices`, `incomplete`, `country: undefined`) und zeigt keine beruhigende Zahl. Ein Gericht mit unvollständiger Deklaration wird in der Gästeansicht als solches markiert.
6. **Menu-Engineering** rechnet aus den erfassten Verkäufen und den Deckungsbeiträgen (`analyseMenu`).

## Konsequenzen

- Ändert ein Lieferant eine Rezeptur, reicht eine Korrektur am Artikel: alle Gerichte und Karten folgen.
- Randen ersetzt nicht die Sorgfalt des Betriebs: Die Angaben sind so gut wie die erfassten Artikel. Das steht in der App bei der Speisekarte.
