# Technische Schulden

Schulden lassen sich nicht ganz vermeiden, aber sie dürfen nicht still wachsen. Jede bekannte Schuld steht hier, mit Grund, Risiko und Plan. Ein PR, der eine Schuld schafft, trägt sie ein. Ein PR, der eine abbaut, markiert sie als erledigt.

**Risiko:** hoch = kann Daten oder Vertrauen kosten · mittel = bremst die nächsten Schritte · tief = Schönheitsfehler.

| Kennung | Schuld | Warum sie besteht | Risiko | Plan | Status |
| --- | --- | --- | --- | --- | --- |
| TD-01 | Abfragen lesen ganze Tabellen eines Betriebs (`ofBusiness`) und filtern im Speicher, auch das Bewegungsjournal | Einfachster Port, der auf Dexie, im Arbeitsspeicher und später auf einem Server gleich aussieht (ADR-0003) | mittel | Gezielte Abfragen am Port (Bewegungen nach Zeitraum, Chargen nach Artikel), sobald ein Betrieb über 50 000 Bewegungen hat; die Indizes in `db.ts` sind schon da | offen |
| TD-02 | Seiten erneuern sich über `useLiveQuery` von Dexie (in `app/hooks.ts` gekapselt), nicht über Domain Events | Schnellster Weg ohne Server; Seiten sehen Dexie nicht | mittel | Abo auf Domain Events, wenn Sync kommt | offen |
| TD-03 | Fotos liegen als Data-URL (JPEG, höchstens 700 000 Zeichen) in IndexedDB, nicht als Blob | Einfachste Lösung, die in Export und Import mitreist (ADR-0006) | tief | Blob-Speicher und eigener Foto-Export, sobald Konten und Sync Fotos bewegen | offen |
| TD-04 | Ein einziger Textkatalog pro Bereich, nur de-CH; Bezeichnungen der Domäne (Allergene, Warengruppen, Gründe) stehen deutsch im Kern | Pilot Schweiz | mittel | Kataloge pro Sprache und Region, Domänen-Bezeichnungen aus dem Kern in Kataloge ziehen | offen |
| TD-05 | Lokale Arbeitsumgebung hat Node 22, das Projekt will 24 | Vorgabe des Containers | tief | CI läuft mit Node 24 | offen |
| TD-06 | Konflikte zwischen Geräten sind nicht gelöst (kein Sync, keine Hybrid Logical Clock) | Ein Gerät pro Betrieb im Pilot | mittel | Mit Konten und Sync: last-write-wins pro Feld mit HLC, wie bei Rettich geplant | offen |
| TD-07 | Die Typen heissen `Rappen` und `pricePer1000`, meinen aber die kleinste Einheit jeder Währung | Pilot in Franken; die Rechnung ist für jede Währung richtig (ADR-0004) | tief | Umbenennen mit Schnittstelle v2 | akzeptiert |
| TD-08 | Ein Teil einer Charge, der verschoben wird, wird eine eigene Charge ohne Verweis auf die ursprüngliche | Verschieben ändert weder Menge noch Wert (ADR-0007) | tief | Feld `splitFrom`, falls Rückverfolgung über Bereiche verlangt wird | offen |
| TD-10 | Kein Startbild (Splash) beim Öffnen vom Home-Bildschirm auf iPhone und iPad, keine Tastaturkürzel im Web | Jede iOS-Grösse braucht ein eigenes Bild; Kürzel sind noch nicht entworfen (ADR-0013) | tief | Startbilder mit dem Symbol-Skript erzeugen; Kürzel für Suche und Erfassen | offen |
| TD-11 | Geprüft wird mit Chromium in iPhone- und iPad-Grösse, nicht mit Safari | Im Arbeitscontainer gibt es kein WebKit (ADR-0013, L-R28) | mittel | Abnahme auf echten Geräten durch Alban; WebKit in der CI, sobald es sich lohnt | offen |
| TD-09 | Rückverfolgung Charge → Gericht → Verkauf ist nur über die Produktion möglich, nicht bis zum einzelnen Gast | Verkäufe werden pro Tag und Gericht erfasst, nicht pro Bon | mittel | Mit einer Kassen-Anbindung (ADR-0011) | offen |
