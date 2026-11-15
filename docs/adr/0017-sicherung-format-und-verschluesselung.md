# ADR-0017: Sicherung: Format und Verschlüsselung

- **Status:** Entwurf, zur Bestätigung durch Alban (Datenformat und Verschlüsselung sind seine Entscheide, CLAUDE.md, Freigabe)
- **Datum:** 2026-11-15
- **Gebaut in:** `packages/core/src/modules/settings/` (`backup.ts`, Befehle `settings.export`, `settings.importPreview`, `settings.import`, `settings.deleteAll`) und `apps/web/src/features/settings/` (`backup-crypto.ts`, `format.ts`, `files.ts`, `last-backup.ts`)

## Kontext

Die Daten liegen nur auf dem Gerät (ADR-0006). Ohne Konto und Server ist die Sicherung die einzige Kopie, die eine Küche bei einem Gerätewechsel, einem verlorenen Tablet oder einem Fehler mitnehmen kann. Sie muss also vollständig, lesbar für die Person und sicher sein, wenn sie den Ort verlässt, an dem sie gespeichert wird.

## Entscheid

1. **Format `randen-backup` Version 1:** Eine Datei, JSON, der ganze Betrieb: Betrieb, Team, alle Tabellen mit ihren Zeilen (gelöschte Zeilen eingeschlossen), Anzahl je Tabelle und Zeitraum der Bewegungen. Die Datei enthält keine Ereignisse; nach dem Zurückspielen beginnt das Ereignisprotokoll leer.
2. **Prüfung vor dem Schreiben:** `settings.importPreview` prüft die Datei ohne zu schreiben (Format, Version, Betrieb, Tabelle, Zeile). `settings.import` prüft jede Zeile, bevor etwas geschrieben wird; eine fehlerhafte Zeile verwirft die ganze Datei. Erst dann wird das Gerät geleert und die Sicherung unverändert geschrieben.
3. **Verschlüsselung mit Passwort, optional:** PBKDF2 mit SHA-256 und 600'000 Runden, zufälliges Salz von 16 Byte, daraus ein AES-GCM-Schlüssel mit 256 Bit. Der Umschlag heisst `randen-encrypted` und trägt Salz und IV, aber keinen Klartext. Ein falsches Passwort und eine beschädigte oder veränderte Datei sind für AES-GCM nicht zu unterscheiden; die App meldet dann «Das Passwort passt nicht. Probiere es noch einmal.», bei unverschlüsselten Dateien «beschädigt».
4. **Nichts verlässt das Gerät:** Die Sicherung wird im Browser gebaut und als Datei angeboten (SE-10), eingelesen über die Dateiauswahl (SE-11). Kein Upload, kein Konto, keine Cloud. Die Erinnerung nach zwei Wochen speichert nur das Datum der letzten Sicherung (SE-12).
5. **Alles löschen leert das Befehlsprotokoll mit:** Die Ergebnisse von Befehlen tragen Namen des Betriebs und des Teams. Ein Gerät hält einen Betrieb (ADR-0003), darum leert `purge` das ganze Protokoll.
6. **Ein Mitglied des Teams wird weich gelöscht**, ohne Prüfung auf Buchungen: Die Buchungen behalten den Namen (ADR-0015, «Wer» an jeder Buchung).

## Begründung

- Eine Datei, die die Person selbst aufbewahrt, ist die einzige Sicherung ohne Dritte; das passt zu ADR-0006.
- PBKDF2 mit 600'000 Runden und AES-GCM sind im Browser ohne eigene Abhängigkeit verfügbar (WebCrypto); der Code stammt aus Rettich, derselbe Entscheid gilt dort.
- Die Prüfung vor dem Schreiben verhindert, dass eine halbe oder fremde Datei den Betrieb zerstört.

## Folgen

- Eine Sicherung, die auf einem zweiten Gerät zurückgespielt wird, ist eine Kopie, kein Abgleich (ADR-0015, Ansicht pro Gerät).
- Die Schlüsselableitung blockiert den Tab etwa eine Sekunde; in einem Web Worker wäre sie flüssiger (schulden.md).
- Das Ereignisprotokoll gehört nicht zur Sicherung; wer es braucht, braucht ein eigenes Format.
