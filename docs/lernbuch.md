# Lernbuch

Was wir aus Fehlern gelernt haben, mit Beleg. Neue Arbeit liest zuerst diese Liste. Die Lektionen L-R… stammen aus Rettich und gelten hier vom ersten Tag an; eigene Lektionen von Randen beginnen bei L-01.

## Aus Rettich übernommen

| Kennung | Lektion | Regel daraus |
| --- | --- | --- |
| L-R01 | IndexedDB beendet eine Transaktion beim ersten fremden `await` | In `storage.transaction` nur Speicher-Aufrufe |
| L-R02 | Playwright nutzt einen schon laufenden Server auf einem festen Port mit | Port über `E2E_PORT`, `reuseExistingServer: false`; parallele Arbeit in eigenen Worktrees |
| L-R03 | axe verlangt, dass ein `aria-label` den sichtbaren Text enthält | «Foto aufnehmen für …», nicht umgestellt |
| L-R07 | Absolut positionierte `sr-only`-Texte entkommen einem Scroll-Container | Scroll-Container und Elemente mit `sr-only`-Kind bekommen `relative`, ein `fieldset` `min-w-0`; bei 390 px auf seitliches Scrollen prüfen |
| L-R10 | Ergebnisse von Hilfs-Agenten können gute Unit-Tests haben und trotzdem E2E brechen | Jedes Ergebnis selbst prüfen und die volle E2E-Suite laufen lassen |
| L-R12 | Unicode-Leerzeichen in einer Regex lösen `no-irregular-whitespace` aus | In Regex ` ` schreiben, nie das Zeichen selbst |
| L-R15 | Eine Prüfung mit einem fehlenden Werkzeug sieht aus wie bestanden | Prüfungen so bauen, dass ein fehlendes Werkzeug auffällt |
| L-R16 | Ein Test rechnete in UTC, die App in Europe/Zurich | Daten in Tests immer vom Zürcher Kalendertag aus; Tests laufen auf einer festen Uhr |
| L-R17 | Eine Rechnung mit fremden Zahlen widersprach sich | Fremde Zahlen markieren (belegt, abgeleitet, geschätzt) und nachrechnen (ADR-0012) |
| L-R18 | `pnpm -s` verschluckt Fehler | `pnpm check` gibt den Exit-Code jedes Schritts aus; die Zeile `ALL=` lesen |
| L-R19 | axe mass den Kontrast mitten in einer Überblendung | axe nur über den wartenden `AxeBuilder` aus `e2e/test.ts` |
| L-R20 | Ein natives Datumsfeld zeigt das Format des Geräts | Datum als Textfeld TT.MM.JJJJ mit Kalender-Knopf |
| L-R27 | Preis und Gewicht der Packung standen am Stück | Preise haben eine einzige Bezugsgrösse (`pricePer1000`, ADR-0004) |
| L-R29 | Zehn Funktionen fertig, aber keine im Auszug | Definition of Done: jede Funktion auf allen Flächen nachziehen |
| L-R30 | Unter Last fielen Tests zufällig aus | Tests warten auf das Ende einer Aktion; `asyncUtilTimeout` 5 s |
| L-R31 | Etwas wurde aus zwei Feldern erraten statt gespeichert | Was die Person sagt, wird gespeichert; was sich berechnen lässt, wird berechnet (ADR-0008) |
| L-R33 | Zwei Live-Abfragen wurden als eine behandelt | Auf jede Live-Abfrage einzeln warten |

## Randen

| Kennung | Lektion | Regel daraus | Beleg |
| --- | --- | --- | --- |
| L-01 | Ohne Vitest-Globals räumt die Testing Library nicht selbst auf: Die Seite des vorigen Tests beantwortete die Abfragen des nächsten | `cleanup()` in `test-setup.ts` nach jedem Test | 14.11.2026, `AppShell.test.tsx` |
| L-02 | Ein Zod-Schema mit `.transform()` lässt sich nicht in JSON Schema wandeln; der Vertragstest fiel aus | Für gleichbleibende Typen `.overwrite()` nutzen (`QuantitySchema`) | 14.11.2026, `application.test.ts` |
| L-04 | Mit «Bewegung reduzieren» setzt die App alle Übergänge auf 0.01 ms; Chrome animierte darauf SVG-Geometrie (`d`, `x`, `width`), und ein Bildschirmfoto traf die Balken halb zwischen Ersatz- und gemessener Breite | Diagramme schalten Übergänge auf ihren Marken ganz ab; Vorschaubilder erst nehmen, wenn `document.getAnimations()` leer ist | 14.11.2026, `ui/charts` |
| L-05 | Ein Fehler, der nur beim Verlassen des Felds erscheint, liess am iPhone getippten Text still fallen: Ein Tipp auf «Sichern» löst dort kein Verlassen aus | Felder melden sich über die Gültigkeit des Browsers (`setCustomValidity`); Formulare ohne `noValidate` | 14.11.2026, `ui/Field.tsx` |
| L-06 | Zwei Agenten schrieben im gemeinsamen Notizbereich in dieselbe Datei, einer prüfte auf einem fremden Port einen fremden Build | Jeder Agent bekommt einen eigenen Unterordner und einen eigenen Port; vor dem Prüfen den Build am Hash erkennen | 14.11.2026, UI-Kit |
| L-07 | Fünf Agenten gleichzeitig rissen Albans 5-Stunden-Limit zweimal; angefangene Arbeit überlebte nur dank Zwischen-Commits | Höchstens zwei bis drei Agenten gleichzeitig; jeder sichert nach jedem Teil mit einem Commit; unterbrochene Arbeit wird im selben Worktree fortgesetzt | 14.11.2026 |
| L-03 | Eine Variable `let cancelled`, die nur im Aufräumen eines Effekts geändert wird, hält der Linter für immer falsch | Ein Objekt `{ cancelled }` nutzen | 14.11.2026, `AppData.tsx` |
