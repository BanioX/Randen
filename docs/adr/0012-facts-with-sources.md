# ADR-0012: Rechtliche Angaben nur mit Quelle, Richtwerte heissen Richtwerte

- **Status:** angenommen
- **Datum:** 2026-11-14

## Kontext

Randen zeigt Dinge, auf die sich ein Betrieb gegenüber Gästen und der Lebensmittelkontrolle stützt: Allergene, Mehrwertsteuersätze, Temperaturgrenzen, Haltbarkeiten.

## Entscheid

1. Jede solche Angabe steht in [`../fakten.md`](../fakten.md) mit Quelle, Lesedatum und einer Markierung: **belegt** (Primärquelle gelesen), **abgeleitet** oder **geschätzt**.
2. Im Code stehen nur belegte Angaben als feste Werte (die vierzehn Allergene, die Mehrwertsteuersätze als Vorschlag). Alles andere ist ein **Richtwert**, heisst in der App so und lässt sich vom Betrieb ändern: Temperaturbereiche, Haltbarkeit von Eigenproduktion, Ausbeuten, Ziel für den Wareneinsatz.
3. Randen ersetzt weder das Selbstkontrollkonzept des Betriebs noch die Auskunft einer fachkundigen Person. Die App sagt das an den Stellen, an denen es zählt (Speisekarte, Selbstkontrolle).
4. Ändert sich das Recht (zum Beispiel ein Mehrwertsteuersatz), wird `fakten.md` zuerst nachgeführt, dann der Vorschlagswert.

## Konsequenzen

- Der Betrieb bleibt verantwortlich und kann jede Grenze an sein eigenes Konzept anpassen.
- Offene Punkte der Recherche stehen am Ende von `fakten.md`.
