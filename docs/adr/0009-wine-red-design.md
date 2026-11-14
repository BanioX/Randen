# ADR-0009: Weinrot, Stein, Onyx; und Zinnober für das, was falsch ist

- **Status:** angenommen
- **Datum:** 2026-11-14

## Kontext

Alban will Randen in Weinrot und premium. Rettich hat gezeigt, was trägt: Apples Human Interface Guidelines, eine Bedeutung pro Farbe, Systemschrift, Dunkelmodus nach dem Gerät. Neu ist: Die Markenfarbe ist rot, und Rot heisst sonst «Achtung». Und Randen wird am Schreibtisch und am Tablet so oft genutzt wie am Handy.

## Entscheid

1. **Drei Töne:** Weinrot (OKLCH, Farbton 10°, `wine-700` `#791432` als Aktionsfarbe), warmer Stein als Grund, Onyx für Schrift, Seitenleiste und die eine dunkle Karte. Gold nur als kleine Auszeichnung auf Dunkel.
2. **Weinrot ist, was du tippst; Zinnober ist, was falsch ist.** `danger` `#C33701` liegt im Farbton 26° neben Weinrot und ist deutlich heller. Es steht immer mit Wort oder Symbol.
3. **Bernstein** heisst bald, **Grün** heisst in Ordnung, alles andere ist Stein.
4. **Drei Breiten:** unter 1024 px fünf Tabs unten wie am iPhone, ab 1024 px eine Seitenleiste in Onyx mit allen Bereichen. Der Inhalt nutzt die Breite mit Spalten und echten Tabellen.
5. **Kontrast ist bewiesen, nicht behauptet:** `pnpm contrast` liest die Tokens und prüft jedes Text-, Flächen- und Diagramm-Paar in Hell und Dunkel gegen WCAG AA.
6. **Diagramme** sind eigene SVG-Bausteine mit sechs festen Reihenfarben, einer Aussage im Titel und einer Zusammenfassung in Worten.

Die Werte stehen in [`../design.md`](../design.md).

## Konsequenzen

- Komponenten nutzen nur Tokens, nie Hex-Werte; ein neuer Ton ist eine Zeile in `index.css` und ein Paar in `scripts/check-contrast.mjs`.
- Das App-Symbol ist eine Rande auf Weinrot. Neu entworfen wird es nur auf Albans Auftrag.
