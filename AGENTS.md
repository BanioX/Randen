# AGENTS.md – Einstieg für KI-Assistenten und neue Entwickler:innen

Randen ist eine local-first PWA für Gastrobetriebe: Lager, Rezepte, Kalkulation, Speisekarte, Einkauf, Zahlen und Selbstkontrolle an einem Ort. Diese Datei ist die Karte. Die Regeln stehen in [`CLAUDE.md`](./CLAUDE.md) und gelten für jedes Werkzeug.

## Lesereihenfolge vor jeder Änderung

1. [`CLAUDE.md`](./CLAUDE.md): Sprache, Arbeitsweise, harte Regeln, Befehle, Definition of Done.
2. [`docs/regeln.md`](./docs/regeln.md): wie Texte, Zahlen und Screens aussehen müssen.
3. [`docs/design.md`](./docs/design.md): Farben, Schrift, Bausteine. Der Styleguide läuft unter `/styleguide`.
4. [`docs/lernbuch.md`](./docs/lernbuch.md) und [`docs/schulden.md`](./docs/schulden.md).
5. Das passende ADR in [`docs/adr/`](./docs/adr/README.md).

## Karte des Codes (drei Schichten, ADR-0003)

| Schicht | Ort | Darf importieren | Inhalt |
| --- | --- | --- | --- |
| Logik | `packages/core/src` | nur sich selbst und `zod` | `model/` Zeilen jeder Tabelle (Zod) · `domain/` reine Regeln: Einheiten und Preise, Ablauf, FEFO, Kalkulation, Deklaration, Menu-Engineering, Betriebsarten und Funktionen (`business-profiles.ts`), Preisänderung (`price-change.ts`) · `contract/` Schnittstelle v1 · `application/` Command-Kit, Lager-Ledger, Bootstrap · `modules/<name>/` Befehle und Abfragen eines Moduls (`contract.ts`, `use-cases.ts`) · `ports/` Speicher · `testing/` Test-Küche |
| Daten | `apps/web/src/data` | core, Dexie | `db.ts` (IndexedDB), `dexie-storage.ts` (Ports auf IndexedDB) |
| Präsentation | `apps/web/src/features/<bereich>`, `apps/web/src/ui`, `apps/web/src/app` | core, `app/hooks`, `ui`; nie `data/` oder `dexie` (ESLint) | Seiten pro Bereich (`routes.tsx`, `messages.ts`) · UI-Kit · Shell, Navigation, Pfade · Funktionen des Betriebs (`app/modules.ts`) und Ansicht des Geräts (`app/view.ts`) |
| Tests | `packages/core/test`, `apps/web/src/**/*.test.ts(x)`, `apps/web/e2e` | – | Vitest (Logik auf `createMemoryStorage`, Seiten auf fake-indexeddb über `renderApp`), Playwright mit axe |

## Ein Modul

Jeder Bereich besteht aus denselben Teilen. Ein Modul ändert nur seine eigenen Dateien:

```
packages/core/src/modules/<name>/contract.ts    Operationen (Zod): <name>Contract
packages/core/src/modules/<name>/use-cases.ts   create<Name>UseCases(ctx): eine Funktion pro Operation
packages/core/test/<name>*.test.ts              Tests auf der Test-Küche (seedKitchen)
apps/web/src/features/<name>/routes.tsx         <name>Routes (lazy geladen)
apps/web/src/features/<name>/messages.ts        alle Texte des Bereichs
apps/web/src/features/<name>/*.tsx              Seiten und ihre Tests
```

- Module rufen einander nicht auf. Gemeinsames liegt im Kern: `domain/` (rechnen), `createStockLedger` (Bestand ändern), `lookup.*` (leichte Listen für Auswahlfelder).
- Seiten lesen mit `useQuery('modul.abfrage', {…})`, schreiben mit `useCommand()`; Links nur über `paths` (`app/paths.ts`).
- Geld zeigen mit `useMoney().format`, Mengen mit `formatQuantity`, Stückpreise mit `formatUnitPrice`, Anteile mit `formatPercent`.
- Drucken nur über `PrintButton` (`ui/PrintButton.tsx`) oder `usePrintAction` (`ui/print.ts`), nie `window.print()` direkt: In der installierten iOS-App tut es nichts. Ein PDF baut eine Seite mit dem Kit aus `ui/pdf/` und übergibt es als `pdf={{ buildPdf, fileName }}`. Dateien verlassen die App nur über `ui/share-file.ts` (ADR-0019).

## Funktionen und Ansicht (ADR-0015)

- Eine **Funktion des Betriebs** (Speisekarte, Einkauf im Markt, Produktion, Menüplan, Mahlzeiten, Auslieferung, Verkäufe, Zahlen, Wo ist was?, Team) ist optional. Ein Einstieg, der nur dann gilt, prüft `useModule('market')` oder `useModules()`. Die Navigation filtert über `NavItem.modules` (`app/nav.ts`). Der Kern ist immer da: Cockpit, Lager, Artikel, Rezepte, Selbstkontrolle.
- **Auswertungen** (Verlauf, Journal, Diagramme, Menu-Engineering, Break-even) zeigt nur die Ansicht «Erweitert»: `useDetailed()`. Die Ansicht gehört dem Gerät und steht nicht in der Sicherung (SE-13).
- Ausgeschaltete Funktionen blenden nur ihre Einstiege aus; ihre Daten bleiben und ihre Adressen funktionieren weiter.
- Das Einrichten (`/setup`, `business.setup`) schlägt die Funktionen aus drei Antworten vor: Betriebsart, Herkunft der Ware, Teamgrösse (`proposeSetup` in `domain/business-profiles.ts`).

## Kit-Regeln (Design-Stufe 2)

- Eine laufende Aktion zeigt `busy` (`Button`) oder `primaryBusy` (`FormActions`), nie `disabled`. `disabled` heisst «geht gerade nicht».
- `danger` ist ein Umriss für gewöhnliche Seiten; gefüllt (`danger-solid`) nur im Bestätigungsdialog.
- Ton `today` (Rotwein, ruhig) heisst «heute dran», `danger` (Zinnober) heisst «falsch». Nie vertauschen ([`docs/design.md`](docs/design.md), «Eine Bedeutung pro Farbe»).
- Freitext rechts in einer Listenzeile: `ListRow trailingWords`; Beträge und Chips ohne.
- Kennzahlen immer in `KpiGrid`; das Raster zählt die Kacheln selbst.
- Bekannte Fehler stehen in [`docs/fehler.md`](docs/fehler.md). Wer einen behebt, streicht ihn dort.

## Befehle

```
pnpm install && pnpm check
PW_CHROMIUM_EXECUTABLE=<chrome> E2E_PORT=4273 pnpm e2e -- --trace off
pnpm preview:shots <route …>        # Bilder für Alban bei sichtbaren Änderungen
```

## Was eine Änderung immer mitbringt

- **Eine neue Nebenwirkung** (Netz, Gerätespeicher, Kamera, Teilen, Drucken): steht im selben PR in `docs/nebenwirkungen.md`. Verlassen Daten neu das Gerät: vorher Albans Entscheid.
- **Eine bewusste Abkürzung:** kommt in `docs/schulden.md`.
- **Eine Lektion aus einem Fehler:** kommt in `docs/lernbuch.md`.
- **Ein neuer Begriff:** kommt ins Glossar. Texte gibt es nur in `messages.ts`; ein Test prüft «du» und «ss».
