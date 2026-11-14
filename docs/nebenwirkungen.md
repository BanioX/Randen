# Nebenwirkungen

Was Randen ausserhalb seiner selbst bewirkt: ans Netz senden, auf dem Gerät speichern, Funktionen des Geräts nutzen, etwas aus der App hinaustragen. Grundsatz ([ADR-0006](adr/0006-data-stays-on-the-device.md)): Betriebsdaten bleiben auf dem Gerät. Was es verlässt, löst die Person selbst aus, und es steht hier.

## So wird das Register geprüft

`apps/web/src/side-effects.test.ts` durchsucht den Code der App (`apps/web/src`, `apps/web/vite.config.ts`, `packages/core/src`; ohne Tests und ohne Kommentare) nach den Arten von Nebenwirkungen, die er kennt. Jede Art, die im Code vorkommt, muss in einer Zeile unten in der Spalte «Im Code» stehen, genau so geschrieben und in Backticks. Sonst schlägt der Test fehl.

- **Neue Art:** im selben PR eine Zeile mit der nächsten Kennung eintragen.
- **Spalte «Daten verlassen das Gerät?»** beginnt mit `ja` oder `nein`.
- **Spalte «Entscheid»** nennt das ADR, das die Zeile trägt.
- **Spalte «Seit»** ist ein Datum (`TT.MM.JJJJ`) oder `geplant`. Geplante Zeilen sind schon eingetragen, damit ein Modul sie nutzen kann, ohne das Register zu ändern; wer die Funktion baut, setzt das Datum.
- **Speicher-Schlüssel** (`randen:…`) stehen in Backticks in der Zeile ihres Speichers.

## Anfragen an einen Server: nur mit Entscheid von Alban

Die App spricht mit keinem Server. Diese Arten lässt der Test nie durch, auch nicht mit einer gewöhnlichen Zeile:

`fetch(` · `XMLHttpRequest` · `WebSocket` · `EventSource` · `sendBeacon`

Kommt eine davon in den Code, braucht ihre Zeile `ja` in «Daten verlassen das Gerät?» und in «Entscheid» den Wortlaut «Alban, TT.MM.JJJJ» mit dem ADR dazu. Vorher gilt: Alban fragen (CLAUDE.md, Arbeitsweise 4). Die Content-Security-Policy (`apps/web/public/_headers`, geprüft von `apps/web/src/security.test.ts`) erlaubt ohnehin nur die eigene Adresse, und die E2E-Tests brechen ab, sobald eine Anfrage sie verlässt.

## Netz

| Kennung | Nebenwirkung | Im Code | Wo | Daten verlassen das Gerät? | Entscheid | Seit |
| --- | --- | --- | --- | --- | --- | --- |
| SE-01 | Abruf der App-Dateien von der eigenen Adresse beim Öffnen und bei einer neuen Version. Der Host sieht dabei wie jede Website die IP-Adresse und den Browser; Randen wertet nichts aus | – (macht der Browser) | `apps/web/public/_headers` | nein, keine Betriebsdaten | ADR-0006 | 14.11.2026 |

## Gerätespeicher

| Kennung | Nebenwirkung | Im Code | Wo | Daten verlassen das Gerät? | Entscheid | Seit |
| --- | --- | --- | --- | --- | --- | --- |
| SE-02 | Datenbank `randen` in IndexedDB: der ganze Betrieb (Mitarbeitende mit Namen, Lagerbereiche und Plätze mit Fotos, Lieferanten, Artikel, Chargen, Lagerbewegungen, Lieferungen, Bestellungen, Inventuren, Rezepte, Produktionen, Speisekarten, Menüplan, Verkäufe, Budgets, Temperaturen und Hygiene-Kontrollen), dazu Ereignisse, ausgeführte Befehle und wer an diesem Gerät arbeitet. Bleibt, bis die Person den Betrieb löscht | `indexedDB` | `apps/web/src/data/db.ts`, `apps/web/src/data/dexie-storage.ts`; Seiten lesen über `apps/web/src/app/hooks.ts` | nein | ADR-0003, ADR-0006 | 14.11.2026 |
| SE-03 | Bitte an den Browser, die Daten bei knappem Platz nicht zu löschen (dauerhafter Speicher), beim Start der App | `storage.persist` | `apps/web/src/data/persistence.ts`, aufgerufen in `apps/web/src/app/AppData.tsx` | nein | ADR-0006 | 14.11.2026 |
| SE-04 | Cache des Service Workers (Cache Storage, Workbox): die Dateien der App, damit sie ohne Netz läuft. Wird mit jeder neuen Version ersetzt | `serviceWorker` | `apps/web/vite.config.ts` (`VitePWA`) | nein | ADR-0003 | 14.11.2026 |
| SE-05 | sessionStorage `randen:reloaded-for-update`: Zeitpunkt des letzten Neuladens für eine neue Version, damit die App nicht in einer Schleife neu lädt. Bleibt, bis der Tab zu ist | `sessionStorage` | `apps/web/src/app/new-version.ts` | nein | ADR-0003 | 14.11.2026 |
| SE-12 | localStorage `randen:last-backup`: der Tag der letzten Sicherung, damit die App nach zwei Wochen ruhig daran erinnert. Kein Inhalt der Sicherung | `localStorage` | Modul Betrieb (noch nicht gebaut) | nein | ADR-0006 | geplant |

## Funktionen des Geräts

| Kennung | Nebenwirkung | Im Code | Wo | Daten verlassen das Gerät? | Entscheid | Seit |
| --- | --- | --- | --- | --- | --- | --- |
| SE-06 | Kamera-App oder Dateiauswahl für ein Foto (Platz, Gericht), nur nach einem Tipp: «Foto aufnehmen» oder «Aus Dateien wählen». Das Bild wird auf dem Gerät verkleinert und liegt danach in der Datenbank (SE-02) | `capture=`, `type="file"`, `createObjectURL` | `apps/web/src/ui/PhotoField.tsx`, `apps/web/src/ui/photo.ts` | nein | ADR-0006 | 14.11.2026 |

## Was die Person selbst hinausträgt

Jede dieser Nebenwirkungen beginnt mit einem Tipp der Person und zeigt vorher, was hinausgeht (ADR-0006, Punkt 4). Nichts davon geschieht von selbst.

| Kennung | Nebenwirkung | Im Code | Wo | Daten verlassen das Gerät? | Entscheid | Seit |
| --- | --- | --- | --- | --- | --- | --- |
| SE-07 | Drucken über den Druckdialog des Geräts: Listen, Karten und Berichte (zum Beispiel Rezeptkarte, Speisekarte, Bestellung, Kontrollblatt) gehen an den Drucker oder in ein PDF | `window.print` | Module (noch nicht gebaut) | ja, nur auf Tipp der Person | ADR-0006 | geplant |
| SE-08 | Teilen über das Teilen-Blatt des Geräts: ein Text (zum Beispiel eine Bestellung) geht an die App, welche die Person wählt | `navigator.share` | Module (noch nicht gebaut) | ja, nur auf Tipp der Person | ADR-0006, ADR-0011 | geplant |
| SE-09 | Kopieren in die Zwischenablage: ein Text (zum Beispiel eine Bestellung), den die Person danach selbst einfügt | `navigator.clipboard` | Module (noch nicht gebaut) | ja, nur auf Tipp der Person | ADR-0006, ADR-0011 | geplant |
| SE-10 | Als Datei sichern: die Sicherung des ganzen Betriebs oder ein Export, abgelegt dort, wo die Person es wählt | `download`, `createObjectURL` | Module (noch nicht gebaut) | ja, nur auf Tipp der Person | ADR-0006 | geplant |
| SE-11 | Datei einlesen über die Dateiauswahl: eine Sicherung zurückholen. Die Datei wird auf dem Gerät gelesen | `type="file"` | Module (noch nicht gebaut) | nein | ADR-0006 | geplant |

## Kennt der Test, kommt heute nicht vor

`localStorage` · `getUserMedia` (Kamerabild in der App) · `Notification` · `window.open` · `document.cookie` · `geolocation`

Wer eine davon braucht, trägt sie oben ein. Die Kamera läuft heute über die Kamera-App des Geräts (SE-06), nicht über ein Kamerabild in der App.
