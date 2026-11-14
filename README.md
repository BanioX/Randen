# Randen

Die Küche im Griff: Lager mit Ablaufdaten, «Wo ist was?» mit Fotos, Rezepte mit Kalkulation und Marge, Produktion, Menüplan, Speisekarte mit Allergenen, Einkauf, Zahlen und Selbstkontrolle. Für Betriebe vom Imbiss bis zur Grossküche. Local-first: Alles läuft auf dem Gerät, ohne Konto und ohne Server.

Randen ist die Schwester von [Rettich](https://github.com/BanioX/FridgeAI) (Haushalte) und übernimmt dessen Architektur. Product Owner: Alban Hyseni. Dieses Repo ist privat.

![Entwurf: Cockpit, Lager, Speisekarte](docs/design/entwurf-2026-11-14.png)

## Stand

Siehe [`docs/plan.md`](docs/plan.md).

## Schnellstart

```
corepack enable
pnpm install
pnpm dev            # App unter http://localhost:5173
pnpm check          # Format, Lint, Typen, Kontrast, Tests, Build
```

## Aufbau

| Ort | Inhalt |
| --- | --- |
| `packages/core` | Die Logik, reines TypeScript: Modell, Rechenregeln (Einheiten, Ablauf, FEFO, Kalkulation, Deklaration, Break-even), Lager-Ledger, Schnittstelle, Module |
| `apps/web` | Die App: React, Tailwind, IndexedDB; UI-Kit, Seiten pro Bereich |
| `docs` | Entscheide (`adr/`), Design, Regeln, Fakten mit Quellen, Glossar, Schulden, Lernbuch |

Karte für alle, die am Code arbeiten: [`AGENTS.md`](AGENTS.md). Regeln: [`CLAUDE.md`](CLAUDE.md).

## Grundsätze

- **Geld ist eine Ganzzahl**, Stückpreise sind Rappen pro 1000 Basiseinheiten ([ADR-0004](docs/adr/0004-money-units-and-prices.md)).
- **Bestand ändert nur das Lager-Ledger**; Kennzahlen lesen die Bewegungen ([ADR-0007](docs/adr/0007-stock-ledger.md)).
- **Allergene, Herkunft, Wareneinsatz und Marge werden berechnet**, nie gespeichert ([ADR-0008](docs/adr/0008-computed-not-stored.md)).
- **Nichts verlässt das Gerät** ([ADR-0006](docs/adr/0006-data-stays-on-the-device.md)).
- **Rechtliche Angaben nur mit Quelle** ([`docs/fakten.md`](docs/fakten.md), [ADR-0012](docs/adr/0012-facts-with-sources.md)).

## Lizenz

Proprietär, alle Rechte bei Alban Hyseni ([`LICENSE`](LICENSE)). Abhängigkeiten behalten ihre eigenen Lizenzen; im ausgelieferten Code nur permissive (`pnpm licenses:check`).
