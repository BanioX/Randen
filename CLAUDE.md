# CLAUDE.md – Randen

Kurzfassung der Regeln. Karte des Codes: [`AGENTS.md`](AGENTS.md) · Stand: [`docs/plan.md`](docs/plan.md) · Entscheide: [`docs/adr/`](docs/adr/) · Design: [`docs/design.md`](docs/design.md) · Regeln für Texte und Screens: [`docs/regeln.md`](docs/regeln.md) · Schulden: [`docs/schulden.md`](docs/schulden.md) · Nebenwirkungen: [`docs/nebenwirkungen.md`](docs/nebenwirkungen.md) · Lernbuch: [`docs/lernbuch.md`](docs/lernbuch.md) · Glossar: [`docs/glossar.md`](docs/glossar.md).

**Name:** Randen, mit grossem R. Technische Namen (Pakete `@randen/*`, Datenbank `randen`) bleiben klein. Farbe: Weinrot.

**Produkt:** Local-first PWA für Gastrobetriebe und Grossküchen: Lager mit Ablaufdaten, «Wo ist was?» mit Fotos, Rezepte mit Kalkulation und Marge, Produktion, Menüplan, der Reste verwertet, digitale Speisekarte mit Allergenen, Einkauf, Budget, Zahlen und Selbstkontrolle (HACCP). Product Owner: Alban Hyseni. Randen ist die Schwester von Rettich (Haushalte) und übernimmt dessen Architektur und Lektionen.

## Sprache
- UI-Texte und Doku: Deutsch (Schweiz), «ss» statt «ß», inklusive Schreibweise (Mitarbeitende, Köch:innen).
- Die App spricht **eine Person mit «du»** an, nie «ihr» oder «Sie». Ein Test prüft alle Textkataloge.
- Code, Bezeichner, Commit-Messages: Englisch.
- Namen ruhig und genau wie bei einer Schweizer Privatbank: «Wareneingang», «Abschreiber», «Inventur», «Deckungsbeitrag». Keine Schlagworte, keine Ausrufezeichen.

## Arbeitsweise
1. Erst Plan, dann Code. Kleine Entscheide selbst treffen und als ADR in `docs/adr/NNNN-titel.md` festhalten.
2. Ein PR = ein Thema, mit Tests und grüner Prüfung. PR-Beschreibung: Was, Warum, Wie getestet.
3. **Previews für Alban:** Bei jeder sichtbaren UI-Änderung `pnpm preview:shots <route …>` und das `sheet.png` mitschicken.
4. **Freigabe:** Alles, was kostenlos ist, darf Claude ohne Rückfrage nutzen. **Alban fragen vor:** allem, was Geld kostet, Preisen, allem, was Betriebsdaten das Gerät neu verlassen lässt, und grösseren Abweichungen vom Produkt.
5. **Strategie bleibt draussen:** Was mit Randen Geld verdienen soll, Preise und Vergleiche mit anderen Produkten stehen nicht in diesem Repo. Hier steht, was gebaut ist und wie.
6. **Lokal zuerst prüfen:** `pnpm check` vor jedem Push; die Zeile `ALL=` lesen und bei `RED` jede Zeile mit `exit=` ungleich 0.
7. **Wenig technische Schulden:** Abkürzungen in `docs/schulden.md`, Nebenwirkungen in `docs/nebenwirkungen.md` (Test prüft), Lektionen in `docs/lernbuch.md`, Begriffe im Glossar.

## Harte Regeln
- **Geld immer als Ganzzahl** in der kleinsten Einheit der Betriebswährung (CHF: Rappen), nie Float (ADR-0004). Stückpreise sind Rappen pro 1000 Basiseinheiten (pro kg, pro Liter, pro 1000 Stück). Mengen dürfen drei Nachkommastellen haben, Geld nie.
- **Bestand ändert nur das Lager-Ledger** (`createStockLedger`, ADR-0007): Jede Mengenänderung schreibt eine Lagerbewegung. Kennzahlen lesen die Bewegungen.
- **Allergene, Diät, Herkunft, Wareneinsatz und Marge werden berechnet, nie gespeichert** (ADR-0008). Fehlt ein Preis oder eine Zutat, sagt die App das, statt eine schöne Zahl zu zeigen.
- Ablaufdaten als Kalendertag (`YYYY-MM-DD`, Europe/Zurich), Zeitpunkte als ISO-UTC. Was sein Verbrauchsdatum hinter sich hat, wird nie verkocht.
- `packages/core` ist reines TypeScript ohne Browser-Abhängigkeit; Äusseres nur über Ports (ADR-0003).
- **Contract-first** (ADR-0005): Die UI ruft nur Commands und Queries der Schnittstelle auf (`useQuery`, `useCommand`), jede Änderung erzeugt ein Domain Event. Jedes Modul besitzt seinen Teil der Schnittstelle.
- **Nichts verlässt das Gerät** (ADR-0006): kein Konto, kein Server, keine Analytics, keine fremden Schriften oder Skripte. Fotos bleiben auf dem Gerät. Die CSP erlaubt nur `'self'`.
- Keine echten Partner-Anbindungen (Kasse, Lieferanten, Bestellsysteme): nur von Hand oder als Export. Bestellungen verschickt die Person selbst.
- Keine Secrets im Repo. Keine echten Personen- oder Firmennamen in Fixtures, Demo-Daten, Logs oder Commits.
- TypeScript `strict`, kein `any`. Neue Dependencies nur kostenlos, gut gepflegt und schlank; im ausgelieferten Code nur permissive Lizenzen (`pnpm licenses:check`).
- Lizenz: proprietär, alle Rechte bei Alban (`LICENSE`).
- Die App nie in Suchmaschinen: `X-Robots-Tag` und `meta robots` stehen auf `noindex`.
- Kamera nur nach Nutzeraktion, mit Fallback auf Datei-Upload.
- Rechtliche Angaben (Allergene, Mehrwertsteuer, Temperaturen) nur aus `docs/fakten.md` mit Quelle; Richtwerte heissen in der App «Richtwert», und der Betrieb kann sie ändern.

## Befehle
Node 24 und pnpm 10 (über `packageManager`/Corepack).

```
pnpm install
pnpm check          # alles unten, mit Exit-Code pro Schritt und der Zeile ALL=GREEN|RED
pnpm format:check   # pnpm format zum Korrigieren
pnpm lint
pnpm typecheck      # inkl. Reinheits-Check von packages/core
pnpm test           # pnpm test:coverage für Abdeckung
pnpm build
pnpm e2e            # Playwright; lokal PW_CHROMIUM_EXECUTABLE setzen, Port über E2E_PORT
```

## Definition of Done
- [ ] Akzeptanzkriterien erfüllt
- [ ] Format, Lint, Typecheck, Unit-Tests, Build und E2E grün
- [ ] Offline-Verhalten und Kamera-Fallback bedacht
- [ ] Keine echten Namen in Logs, Fixtures, Commits
- [ ] UI-Texte de-CH mit «du» und «ss», a11y-Basics (Labels, Kontrast, Fokus, 44 px), bei 390 px kein seitliches Scrollen, hell und dunkel
- [ ] Neue Funktion auf den Flächen nachgezogen oder bewusst weggelassen (Cockpit, Liste, Detail, Zahlen, Druck/Export, Demo-Daten)
- [ ] Doku/ADR aktualisiert, Schulden und Nebenwirkungen eingetragen
