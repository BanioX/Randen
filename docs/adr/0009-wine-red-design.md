# ADR-0009: Rotwein, Traube, Kork; und Zinnober für das, was falsch ist

- **Status:** angenommen
- **Datum:** 2026-11-14

## Kontext

Alban will Randen «mehr Dunkelrot, premium wie Rotwein» und hat am 14.11.2026 drei Töne vorgegeben: Rotwein `#6D1F2F`, Traube `#3F0F1C`, Kork `#E8D9C0`, Schrift in Onyx. Rettich hat gezeigt, was trägt: Apples Human Interface Guidelines, eine Bedeutung pro Farbe, Systemschrift, Dunkelmodus nach dem Gerät. Neu ist: Die Markenfarbe ist rot, und Rot heisst sonst «Achtung». Und Randen wird am Schreibtisch und am Tablet so oft genutzt wie am Handy.

## Entscheid

1. **Drei Töne:** Rotwein (`wine-700`, die Aktionsfarbe; die Skala `wine-50` bis `wine-950` hält seinen Farbton), Traube (`grape`) für Seitenleiste und die eine dunkle Karte, Kork (`cork`) als Beschriftung auf Traube und in hellen Abstufungen als Grund. Schrift in Onyx wie bei Rettich.
2. **Rotwein ist, was du tippst; Zinnober ist, was falsch ist.** `danger` `#C33701` liegt im Farbton 24° neben Rotwein und ist deutlich heller. Es steht immer mit Wort oder Symbol.
3. **Bernstein** heisst bald, **Grün** heisst in Ordnung, alles andere ist Kork.
4. **Drei Breiten:** unter 1024 px fünf Tabs unten wie am iPhone, ab 1024 px eine Seitenleiste in Traube mit allen Bereichen. Der Inhalt nutzt die Breite mit Spalten und echten Tabellen.
5. **Kontrast ist bewiesen, nicht behauptet:** `pnpm contrast` liest die Tokens und prüft jedes Text-, Flächen- und Diagramm-Paar in Hell und Dunkel gegen WCAG AA.
6. **Diagramme** sind eigene SVG-Bausteine mit sechs festen Reihenfarben, einer Aussage im Titel und einer Zusammenfassung in Worten.

Die Werte stehen in [`../design.md`](../design.md).

## Konsequenzen

- Komponenten nutzen nur Tokens, nie Hex-Werte; ein neuer Ton ist eine Zeile in `index.css` und ein Paar in `scripts/check-contrast.mjs`.
- Das App-Symbol ist eine Rande auf Rotwein. Neu entworfen wird es nur auf Albans Auftrag.
