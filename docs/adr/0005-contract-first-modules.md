# ADR-0005: Contract-first, und jedes Modul besitzt seinen Teil

- **Status:** angenommen
- **Datum:** 2026-11-14

## Kontext

Randen deckt viele Bereiche ab: Lager, Rezepte, Speisekarte, Einkauf, Zahlen, Selbstkontrolle. Sie sollen sich unabhängig entwickeln lassen, auch von mehreren Leuten oder Agenten gleichzeitig, und später ohne Umbau über eine API erreichbar sein.

## Entscheid

1. **Jede Aktion ist ein benannter Befehl oder eine Abfrage** mit Zod-Schema für Ein- und Ausgabe (`CONTRACT_V1`). Die Oberfläche ruft nur diese auf.
2. **Jedes Modul besitzt seinen Teil:** `packages/core/src/modules/<name>/contract.ts` und `use-cases.ts`. `CONTRACT_V1` ist die Summe. Ein Test stellt sicher, dass keine Operation zwei Modulen gehört und jede umgesetzt ist.
3. **Module rufen einander nicht auf.** Gemeinsames liegt im Kern: das Modell, die reinen Regeln (`domain/`), das Lager-Ledger und die leichten Listen `lookup.*`.
4. **Jeder Befehl** trägt `commandId` (ein wiederholter Befehl gibt das gespeicherte Ergebnis zurück), läuft in einer Transaktion und schreibt mindestens ein **Domain Event** (`ding.was_geschah`, mit Person und Zeit).
5. **Ein Schema, mehrere Formate:** Aus denselben Schemas entsteht JSON Schema (`contractJsonSchemas`). Ein Test prüft, dass das jederzeit geht.
6. **Fehler mit Code** (`CommandError`): `not_found`, `invalid`, `duplicate_name`, `in_use`, `insufficient_stock`, `not_allowed`. Die Oberfläche macht daraus einen Satz.

## Konsequenzen

- Ein neues Modul ist ein neuer Ordner und zwei Zeilen in der Registry.
- Zugriff Dritter auf Betriebsdaten gibt es nicht; die Scopes an jeder Operation halten fest, welches Recht sie später bräuchte.
