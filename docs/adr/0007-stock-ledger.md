# ADR-0007: Chargen, FEFO und das Lager-Ledger

- **Status:** angenommen
- **Datum:** 2026-11-14

## Kontext

In einer Küche liegt derselbe Artikel in mehreren Lieferungen mit verschiedenen Daten und Preisen. Budget, Wareneinsatz und Abschreiber stimmen nur, wenn jede Mengenänderung nachvollziehbar ist.

## Entscheid

1. **Bestand ist die Summe aktiver Chargen** (`StockLot`): je Lieferung oder Produktion eine Charge mit Menge, Datum, Datumsart und Einstandspreis.
2. **Nur das Ledger ändert Bestand** (`createStockLedger`): `receive`, `consume`, `consumeMany`, `consumeLot`, `writeOff`, `adjust`, `move`. Jede Mengenänderung schreibt eine **Lagerbewegung** (`StockMovement`, nur anfügen) mit Menge, Wert, Tag, Person und Grund.
3. **Invariante:** Für jeden Artikel ergeben die Chargen dieselbe Menge und denselben Wert wie die Summe seiner Bewegungen. Ein Eigenschaftstest prüft das über beliebige Buchungsfolgen.
4. **FEFO:** Ware geht nach «first expired, first out» ab: frühestes Datum zuerst, Chargen ohne Datum zuletzt.
5. **Verbrauchsdatum ist hart:** Was sein Verbrauchsdatum hinter sich hat, wird nie verkocht (`mustNotUse`); es bleibt im Bestand sichtbar, bis es abgeschrieben ist. Ein überschrittenes Mindesthaltbarkeitsdatum ist ein Hinweis, der Entscheid liegt beim Betrieb.
6. **Fehlmengen blockieren nicht:** Reicht der Bestand nicht, bucht das Ledger, was da ist, und meldet den Rest. Eine Küche, die trotzdem gekocht hat, bekommt ihre Zahlen.
7. **Kennzahlen lesen die Bewegungen:** Einkauf = Eingänge, Wareneinsatz = Verbrauch, Abschreiber = Verluste mit Grund, Inventurdifferenz = Korrekturen.

## Konsequenzen

- Der letzte Einstandspreis wird am Artikel gemerkt; die Preisgeschichte steht in den Eingängen.
- Verschieben schreibt keine Bewegung (nichts geht verloren); ein Teil wird eine eigene Charge.
