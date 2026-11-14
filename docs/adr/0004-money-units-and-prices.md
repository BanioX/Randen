# ADR-0004: Geld als Ganzzahl, Stückpreise pro 1000 Basiseinheiten

- **Status:** angenommen
- **Datum:** 2026-11-14

## Kontext

Eine Kalkulation, die um Rappen daneben liegt, verliert das Vertrauen der Küche. Gleichzeitig rechnet eine Küche mit Gramm Safran und halben Zitronen.

## Entscheid

1. **Geld ist immer eine Ganzzahl** in der kleinsten Einheit der Betriebswährung (CHF: Rappen), Typ `Rappen`. Nie Float. Eine Währung pro Betrieb; Formatierung unabhängig von der Laufzeit (`formatMoney`).
2. **Mengen** stehen in Basiseinheiten: Gramm, Milliliter, Stück. Sie dürfen höchstens drei Nachkommastellen haben («2.5 g», «0.5 Stk.»). kg, l und dl sind nur Anzeige (`formatQuantity`, `parseQuantityInput`).
3. **Ein Stückpreis ist Rappen pro 1000 Basiseinheiten** (`pricePer1000`): pro Kilogramm, pro Liter, pro 1000 Stück. So gilt für jede Einheit dieselbe Rechnung: Menge × Preis = Tausendstel-Rappen. Ein Ei zu 45 Rappen steht als 45 000, eine Serviette zu 1.2 Rappen als 1200.
4. **Gerundet wird einmal pro Zeile** auf ganze Tausendstel-Rappen (`valueMilli`), summiert werden Ganzzahlen, und erst das Ergebnis wird zu Rappen (`milliToRappen`, kaufmännisch).
5. **Netto und brutto:** Rezepte führen Nettomengen (was in die Pfanne kommt). Lager und Kalkulation rechnen mit der Bruttomenge: netto ÷ Ausbeute des Artikels (`yieldBps`).
6. **Anteile** sind Basispunkte (3000 = 30 %), **Temperaturen** Zehntelgrad (45 = 4.5 °C).
7. **Mehrwertsteuer:** Der Verkaufspreis eines Gerichts ist brutto. Marge und Wareneinsatz rechnen mit dem Nettopreis (`netOfVat`). Der Satz steht auf jedem Rezept und jedem Verkauf.

## Konsequenzen

- Der Wert einer Lagerbewegung ist die Differenz des Chargenwerts vorher und nachher. So gehen die Bewegungen einer Charge ohne Rundungsdrift auf.
- Wer Preise anzeigt oder liest, nutzt `formatUnitPrice` und `parseUnitPrice`; niemand teilt selbst durch 1000.
