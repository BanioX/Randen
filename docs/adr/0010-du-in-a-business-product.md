# ADR-0010: «du» auch im Geschäftsprodukt

- **Status:** angenommen (Albans Bestätigung offen)
- **Datum:** 2026-11-14

## Kontext

Rettich spricht eine Person mit «du» an. Randen richtet sich an Betriebe. In Schweizer Küchen ist «du» die übliche Anrede, in Verträgen und Offerten nicht.

## Entscheid

Die App spricht **eine Person mit «du»** an, nie «ihr» und nie «Sie». Der Ton ist ruhig und genau wie bei einer Schweizer Privatbank: Fachwörter der Küche («Wareneingang», «Abschreiber», «Inventur», «Mise en place», «Deckungsbeitrag»), keine Schlagworte, keine Ausrufezeichen, keine Emojis. Ein Test prüft alle Textkataloge.

Was Gäste lesen (die Speisekarte), spricht niemanden direkt an oder nutzt den Text des Betriebs.

## Konsequenzen

- Will Alban für Randen die Sie-Form, ist das eine Änderung der Textkataloge und des Tests, nicht des Codes.
