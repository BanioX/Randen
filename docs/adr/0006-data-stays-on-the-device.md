# ADR-0006: Betriebsdaten bleiben auf dem Gerät

- **Status:** angenommen
- **Datum:** 2026-11-14

## Kontext

Einkaufspreise, Margen und Rezepte sind das Kapital eines Betriebs. Dazu kommen Namen von Mitarbeitenden in den Kontrollblättern.

## Entscheid

1. **Kein Server, kein Konto, keine Analytics, kein Fehler-Tracking.** Die Content-Security-Policy erlaubt nur `'self'`; ein Test und ein E2E-Fixture prüfen, dass keine Anfrage die eigene Adresse verlässt.
2. **Fotos** (Plätze, Gerichte) werden auf dem Gerät verkleinert und als Data-URL in IndexedDB gehalten. Sie reisen nur im Export mit.
3. **Export, Import, Löschen:** Der Betrieb lässt sich jederzeit vollständig als Datei sichern, zurückholen und endgültig löschen.
4. **Was das Gerät verlässt, entscheidet die Person:** drucken, eine Bestellung kopieren oder teilen, eine Speisekarte als Datei speichern. Jede solche Nebenwirkung steht in [`../nebenwirkungen.md`](../nebenwirkungen.md).
5. **Nicht in Suchmaschinen:** `X-Robots-Tag` und `meta robots` stehen auf `noindex`.
6. **Keine echten Namen** in Demo-Daten, Fixtures, Logs und Commits.

## Konsequenzen

- Mehrere Geräte teilen heute keine Daten; der Weg dorthin (Konten, Sync) ist ein Entscheid von Alban, weil dabei Daten das Gerät verlassen.
- Eine Speisekarte, die Gäste auf dem eigenen Handy öffnen, braucht eine Adresse im Netz. Das ist nicht gebaut; die Gästeansicht läuft auf einem Gerät des Betriebs oder als gespeicherte Datei.
