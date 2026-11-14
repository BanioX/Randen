# ADR-0003: Drei Schichten, local-first, eigene IDs und Soft-Delete

- **Status:** angenommen
- **Datum:** 2026-11-14

## Kontext

Eine Küche hat im Keller keinen Empfang, und ein Betrieb will seine Zahlen nicht bei Fremden wissen. Gleichzeitig soll Randen später mehrere Geräte und Standorte verbinden können, ohne neu gebaut zu werden.

## Entscheid

1. **Drei Schichten.** Präsentation (`apps/web`: `app`, `features`, `ui`) kennt nur die Schnittstelle. Logik (`packages/core`) kennt nur Ports. Daten setzen die Ports um: heute Dexie im Browser, in Tests der Speicher im Arbeitsspeicher, später ein Server. ESLint prüft die Grenzen.
2. **Local-first.** Die App läuft ohne Konto und ohne Netz. Beim ersten Start legt sie still einen Betrieb «Mein Betrieb» mit einer Person und drei Lagerbereichen an.
3. **Sync-fähig ab Tag 1.** Jede Zeile hat eine auf dem Gerät erzeugte **UUIDv7**, eine `businessId`, `createdAt`, `updatedAt` und `deletedAt` (Soft-Delete). Gelöscht wird nie hart, ausser beim Löschen des ganzen Betriebs.
4. **Ein Betrieb ist eine Küche.** Ein zweiter Standort ist ein zweiter Betrieb. Alles gehört zu genau einem Betrieb.
5. **Seiten lesen über `useQuery`.** Die Abfrage läuft auf dem Gerät und erneuert sich, sobald ein Befehl Daten ändert, die sie gelesen hat. Seiten importieren weder Dexie noch die Datenschicht.
6. **Transaktionen:** In `storage.transaction` stehen nur Speicher-Aufrufe. IndexedDB beendet eine Transaktion beim ersten fremden `await`.

## Konsequenzen

- Die Logik lässt sich ohne Browser testen, schnell und vollständig.
- Abfragen lesen heute ganze Tabellen eines Betriebs (`ofBusiness`) und filtern im Speicher. Das trägt für einen Betrieb über Jahre; für sehr grosse Bewegungsjournale stehen gezielte Abfragen in `docs/schulden.md`.
- Konflikte zwischen Geräten sind noch nicht gelöst; die Felder dafür sind da.
