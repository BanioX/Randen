# ADR-0001: Architekturentscheide festhalten

- **Status:** angenommen
- **Datum:** 2026-11-14

## Kontext

Randen entsteht als Schwester von Rettich und übernimmt dessen Arbeitsweise: Entscheide mit Folgen stehen im Repo, nicht in Köpfen oder Chats.

## Entscheid

Jeder Entscheid mit Folgen steht als eigene Datei `docs/adr/NNNN-titel.md` mit Status, Datum, Kontext, Entscheid und Konsequenzen. Kleine Entscheide trifft Claude selbst und hält sie fest. Entscheide zu Geld, Preisen und neuen Datenflüssen trifft Alban. Ein abgelöstes ADR bleibt als Verlauf stehen. Die Tabelle in [`README.md`](README.md) wird im selben PR nachgeführt.

## Konsequenzen

- Wer etwas ändert, liest zuerst das passende ADR.
- Was mit Randen Geld verdienen soll und wie es sich von anderen Produkten abhebt, steht nicht hier (CLAUDE.md, Arbeitsweise 5).
