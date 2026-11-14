# ADR-0002: Tech-Stack und Tooling

- **Status:** angenommen
- **Datum:** 2026-11-14

## Kontext

Rettich hat in über 300 PRs einen Stack erprobt, der für eine local-first PWA trägt. Randen ist dasselbe Handwerk für eine andere Kundschaft.

## Entscheid

Derselbe Stack wie Rettich, ohne Abweichung, damit Wissen und Bausteine zwischen den beiden Produkten wandern können.

| Bereich | Wahl |
| --- | --- |
| Laufzeit, Pakete | Node 24 LTS (`.nvmrc`), pnpm 10 über `packageManager` und Corepack |
| Sprache | TypeScript 6, `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`, `erasableSyntaxOnly` |
| Reinheit von `core` | eigenes `tsconfig.src.json` ohne DOM- und Node-Typen, dazu `no-restricted-globals` und `no-restricted-imports` in ESLint |
| Lint, Format | ESLint 10 mit typescript-eslint `strictTypeChecked`; Prettier für Code, Markdown ausgenommen |
| Tests | Vitest 5 mit Projekten je Paket, fast-check für Eigenschaften, Schwelle 90 % Zeilen für `packages/core/src` |
| E2E | Playwright (Chromium) mit axe; Port über `E2E_PORT` |
| Build, UI | Vite 8, React 19, React Router 8 (SPA), Tailwind CSS 4, `vite-plugin-pwa` |
| Daten | Dexie (IndexedDB), Zod 4 für jede Zeile und jede Operation |
| Diagramme | eigene SVG-Bausteine, keine Bibliothek |
| Druck | Druckansichten mit CSS (`@media print`), keine PDF-Bibliothek |

**Lieferkette:** `minimumReleaseAge: 4320` in `pnpm-workspace.yaml`: Es wird nur installiert, was mindestens drei Tage veröffentlicht ist. Dependabot wartet ebenso lang.

**Lizenzen:** Im ausgelieferten Code nur permissive Lizenzen (MIT, Apache-2.0, ISC, BSD, OFL), nirgends GPL oder AGPL. `pnpm licenses:check` prüft das, auch in der CI. Randen selbst ist proprietär (`LICENSE`).

## Konsequenzen

- Keine Diagramm- und keine PDF-Bibliothek heisst: weniger Gewicht im Bundle und keine fremden Lizenzen, dafür eigene Pflege der Diagramme.
- Lokal läuft teils Node 22; massgebend ist die CI mit Node 24.
