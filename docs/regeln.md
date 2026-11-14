# Regeln für Texte und Screens

Was über 300 PRs von Rettich darüber gelehrt haben, wie ein Produkt von Alban aussieht, liest und sich anfühlt, damit jeder Screen von Randen am ersten Tag stimmt. Quellen in Klammern: R-ADR = ADR von Rettich, L-R = Lektion aus Rettich ([`lernbuch.md`](lernbuch.md)), ADR = Entscheid von Randen.

## A. Sprache und Ton

1. Deutsch (Schweiz): «ss» statt «ß», Dezimalpunkt, Apostroph bei Tausendern. Inklusive Schreibweise mit Doppelpunkt, wo Personen gemeint sind: Mitarbeitende, Köch:innen (CLAUDE.md).
2. Die App spricht **eine Person mit «du»** an, nie «ihr», «euch» oder «Sie» (ADR-0010; R-CLAUDE.md, Alban 6.11.2026). Ein Test prüft alle Textkataloge.
3. **Namen wie bei einer Schweizer Privatbank** (R-ADR-0047): ruhig, genau, Fachwort vor Kunstwort. Keine Schlagworte («smart», «Insights», «Hub», «Gamechanger»), keine Ausrufezeichen, keine Emojis, keine Anglizismen, wo es ein Küchenwort gibt.
4. **Wörter der Küche:** Wareneingang, Lieferschein, Charge, Abschreiber, Inventur, Mise en place, Posten, Kühlzelle, Tiefkühlzelle, Trockenlager, Ausbeute, Wareneinsatz, Deckungsbeitrag, Tellerrücklauf. Das [Glossar](glossar.md) gilt.
5. **Knöpfe** sind ein Verb oder ein Verb mit Sache, in der Grundform: «Sichern», «Wareneingang buchen», «Abschreiben», «Inventur abschliessen». Nie «OK», nie «Ja»/«Nein»: Der Knopf sagt, was passiert.
6. **Titel** sind die Sache, nicht die Tätigkeit: «Lager», «Rezepte», «Wareneingang». Auf Formularen «Artikel erfassen», «Artikel bearbeiten».
7. **Leere Zustände** sagen in einem Satz, was hier stehen wird, und bieten die eine Aktion an: «Noch keine Rezepte. Mit dem ersten Rezept rechnet Randen Wareneinsatz und Marge.»
8. **Fehler** sagen, was ist und was zu tun ist, ohne Schuld und ohne Technik: «Dafür ist zu wenig an Lager.» Nie «Fehler 500», nie «ungültige Eingabe».
9. **Bestätigungen** nennen die Zahl: «3 Chargen gebucht, CHF 412.60». Ein Toast ist eine ruhige Zeile, kein Lob.
10. **Löschen** fragt nach und sagt, was verloren geht: «Rezept löschen? Es verschwindet aus dem Rezeptbuch. Produktionen und Verkäufe bleiben in den Zahlen.»
11. **Ehrlich bei Lücken** (ADR-0008): «Preis fehlt», «Herkunft fehlt», «3 Gerichte ohne Preis». Nie eine schöne Zahl auf lückenhaften Daten.
12. **Richtwert heisst Richtwert** (ADR-0012): Temperaturbereiche, Haltbarkeiten und Ausbeuten sind Vorschläge, die der Betrieb ändert.

| Statt | Schreib |
| --- | --- |
| Lieferung erfolgreich gespeichert! | 3 Chargen gebucht, CHF 412.60 |
| Bist du sicher? | Charge abschreiben? 1.5 kg Lachsfilet, CHF 57.00 |
| Keine Daten vorhanden | Noch kein Wareneingang. Buche die erste Lieferung. |
| Ungültige Menge | Die Charge hat 4 kg. Trag höchstens so viel ein. |
| Food Waste | Abschreiber |
| Müll, Kübel | Abfall |
| Tellerrest | Tellerrücklauf |
| Bestand anpassen | Inventur |
| Smart-Vorschlag | Vorschlag |
| Marge OK ✅ | 28.4 % im Ziel |
| Achtung!!! Abgelaufen | Nicht mehr verwenden |
| Lagerraum | Lagerbereich (Kühlzelle, Tiefkühlzelle, Trockenlager, Posten) |
| Bestellung senden | Bestellung kopieren (verschicken tust du selbst) |
| Temperatur nicht OK | 7.5 °C, über dem Bereich von 0 bis 5 °C |

## B. Zahlen, Geld, Datum

1. **Geld:** `CHF 1’234.50`, immer zwei Stellen, über `useMoney().format` (R-ADR-0018, ADR-0004). In Tabellen rechtsbündig mit `tabular-nums`.
2. **Mengen:** `2.5 kg`, `750 g`, `1.2 l`, `330 ml`, `12 Stk.` über `formatQuantity`; auf Rezeptkarten Deziliter (`2.5 dl`) mit `style: 'kitchen'`.
3. **Stückpreise:** `CHF 62.00 / kg`, `CHF 6.40 / l`, `CHF 0.45 / Stk.` über `formatUnitPrice`. Niemand teilt selbst durch 1000.
4. **Anteile:** `30 %`, `8.1 %`, `35.3 %` über `formatPercent`, mit Leerzeichen vor dem Zeichen.
5. **Temperaturen:** `4.5 °C`, `-18 °C` über `formatTemperature`.
6. **Datum:** `14.11.2026` über `formatSwissDate`. In Listen relativ: «heute», «morgen», «in 3 Tagen», «seit 2 Tagen» über `relativeDays`; ferne Daten als Datum.
7. **Der Tag ist der Schweizer Kalendertag** (Europe/Zurich), auch um Mitternacht und in Tests (L-R16).
8. Eingaben nehmen Punkt und Komma als Dezimalzeichen, und Einheiten, wie Leute sie tippen: «2,5 kg», «7.5 dl».
9. **Datumsfeld** ist ein Textfeld TT.MM.JJJJ mit Kalender-Knopf und Schnellwahl, nie das native Feld (L-R20).

## C. Gestaltung

1. Apples Human Interface Guidelines sind der Massstab (R-ADR-0021): Systemschrift, grosser Titel, ruhige Flächen, klare Hierarchie.
2. **Eine Hauptaktion pro Seite**, als gefüllter Knopf in Rotwein. Alles andere ist ruhig.
3. **Eine Bedeutung pro Farbe** (ADR-0009; R-ADR-0075): Rotwein = tippen und gewählt · Zinnober = falsch · Bernstein = bald · Grün = in Ordnung · Traube = die eine dunkle Karte mit der Leitzahl · Kork = alles andere. Farbe nie ohne Wort oder Symbol.
4. **Ruhiger Start** (R-ADR-0074): Das Cockpit zeigt zuerst, was heute zu tun ist, dann die Zahlen. Hinweise sind ruhige Zeilen, keine bunten Kästen.
5. **Aktion zuerst auf Detailseiten** (R-ADR-0079): Was man hier am häufigsten tut, steht oben.
6. **Eine Stelle pro Aktion** (R-ADR-0060): Dieselbe Aktion steht nicht zweimal auf einem Screen.
7. **Listen** sind «inset grouped»: eine weisse, abgerundete Gruppe mit Haarlinien ab dem Text. **Zahlen zum Vergleichen** stehen in einer echten Tabelle.
8. **Ziele mindestens 44 px**, am Handy das Wichtige unten.
9. **Sauber ausgerichtet** (Alban, 7.11.2026): eine Achse pro Fläche, Text wird nie angeschnitten; was nicht passt, bricht um oder fällt weg.
10. **iPhone, iPad, Web** (ADR-0013): Jede Seite wird in vier Ansichten gebaut und angeschaut: iPhone 390 px, iPad hochkant 820 px, iPad quer 1180 px, Web 1440 px. Ohne Präfix ist das iPhone, `md:` das iPad hochkant, `lg:` iPad quer und Web. Nichts scrollt seitwärts, nichts liegt hinter Leisten, kein Feld ist kleiner als 16 px, nichts hängt am Hover.
11. **Dunkelmodus** folgt dem Gerät; jede Seite stimmt in beiden.
12. **Keine Emojis**, Symbole aus Lucide in einer Stärke (R-ADR-0080). Fotos nur von echten Dingen: Plätze und Gerichte.

## D. Interaktion

1. **Sheets** kommen am Handy von unten und liegen über der Tab-Leiste; ab Tablet sind sie ein Dialog in der Mitte. Escape und ein Schliessen-Knopf gehen immer.
2. **Rückgängig statt Rückfrage**, wo eine Gegenbuchung billig ist: Toast mit «Rückgängig» für 5 Sekunden. Was Geld oder Bestand endgültig bewegt, fragt nach.
3. **Kamera nur nach einem Tipp**, mit «Aus Dateien wählen» als zweitem Weg (R-ADR-0078). Fotos werden auf dem Gerät verkleinert.
4. **Fotos gross:** Ein Tipp auf ein Platz- oder Gerichtsfoto zeigt es über den ganzen Bildschirm (R-ADR-0082).
5. **Wischen ist nur eine Abkürzung**; jede Aktion hat auch einen Knopf (WCAG 2.5.1).
6. **Bewegung** 150 bis 200 ms; «Bewegung reduzieren» schaltet sie ab.
7. **Schnell erfassen:** Fokus springt ins nächste Feld, Enter fügt die nächste Zeile hinzu, das Übliche ist vorbelegt.

## E. Datenschutz und Daten

1. **Nichts verlässt das Gerät** ohne Entscheid von Alban (ADR-0006): kein Server, keine Analytics, keine fremden Schriften.
2. Was die Person selbst hinausträgt (drucken, kopieren, teilen, als Datei sichern), steht in [`nebenwirkungen.md`](nebenwirkungen.md).
3. **Sichern, Zurückholen, Löschen** des ganzen Betriebs gehen jederzeit.
4. **Keine Überwachung einzelner Personen:** «Wer» steht an einer Buchung, damit man nachfragen kann. Auswertungen zeigen den Betrieb, nie eine Rangliste von Mitarbeitenden.
5. **Keine echten Namen** in Demo-Daten, Tests und Bildern.
6. Die App ist ein **Hilfsmittel**, kein Nachweis: Sie ersetzt weder das Selbstkontrollkonzept noch die Auskunft einer fachkundigen Person (ADR-0012).

## F. Arbeitsweise und Tests

Die Lektionen stehen mit Beleg im [Lernbuch](lernbuch.md). Kurz:

1. In einer Transaktion nur Speicher-Aufrufe (L-R01).
2. E2E auf eigenem Port (`E2E_PORT`), parallele Arbeit in eigenen Worktrees (L-R02).
3. Ein `aria-label` enthält den sichtbaren Text (L-R03).
4. `sr-only` braucht `relative`, ein `fieldset` `min-w-0`; bei 390 px auf seitliches Scrollen prüfen (L-R07).
5. Jedes Agenten-Ergebnis selbst prüfen, volle E2E-Suite (L-R10).
6. In Regex ` `, nie das Zeichen (L-R12).
7. Tests laufen auf der festen Uhr; Daten vom Zürcher Kalendertag aus (L-R16).
8. axe nur über den wartenden `AxeBuilder` (L-R19).
9. Tests warten auf das Ende einer Aktion und auf jede Live-Abfrage einzeln (L-R30, L-R33).
10. Jede neue Funktion geht alle Flächen durch: Cockpit, Liste, Detail, Zahlen, Druck, Demo-Daten (L-R29).
11. `pnpm check`: die Zeile `ALL=` lesen (L-R18).

## G. Was Randen nicht übernimmt

| Rettich (Haushalt) | Randen (Küche) |
| --- | --- |
| «Heute retten» als Ritual mit Belohnung | «Heute verwerten» als Tagesliste, mit einem Weg in den Menüplan |
| Abzeichen, wachsender Rettich | Zahlen: Abschreiber in Franken, Wareneinsatz, Break-even |
| «Verwertet» und «Entsorgt» | Verbrauch (Produktion, Verkauf) und Abschreiber nach Art |
| Laden-Buchstaben, Quittung scannen | Lieferanten, Lieferschein; das Lesen per Foto folgt später mit derselben Texterkennung |
| «Gehört» mit Initialen | «Wer» an jeder Buchung |
| Kühlschrank, Tiefkühler, Vorrat, Notvorrat | Kühlzelle, Tiefkühlzelle, Trockenlager, Bar und Weinkeller, Posten |
| Rezepte als Anregung unter «Wissen» | Rezepte als Rezeptur mit Kalkulation, Deklaration und Produktion |

---

## H. Muster für Seiten (gilt für jedes Modul)

Jede Seite von Randen folgt einem von fünf Mustern. Wer eine Seite baut, wählt das Muster und weicht nicht ab, damit sich die App überall gleich anfühlt.

### H1. Liste

1. `PageHeader` mit Titel und der einen Hauptaktion rechts (zum Beispiel «Artikel erfassen»).
2. Darunter höchstens eine Zeile zum Eingrenzen: `SearchField`, dazu `SegmentedControl` oder `ChoiceChips`. Filter stehen in der Adresse (`?q=`, `?filter=`), damit «Zurück» die Liste so zeigt, wie sie war.
3. Inhalt: Wo Zahlen verglichen werden (drei oder mehr Zahlenspalten), eine `DataTable`; Nebenspalten mit `hideBelow` ausblenden, am Handy bleiben Name und die eine wichtigste Zahl. Sonst eine `GroupedList` mit `ListRow`.
4. Leer: `EmptyState` mit einem Satz und der Hauptaktion. Suche ohne Treffer: ein ruhiger Satz, kein leerer Bildschirm.
5. Eine Zeile öffnet die Detailseite. In der Zeile stehen keine weiteren Knöpfe.

### H2. Detail

1. `PageHeader` mit Rücklink («‹ Artikel»), Titel und einer Hauptaktion.
2. Zuoberst das Wichtigste als Kennzahlen (`StatTile`) oder eine Karte; auf Seiten mit einer Leitzahl die eine dunkle Karte (`Card variant="premium"`).
3. Inhalt in Karten; ab dem iPad hochkant zwei Spalten, wo es dem Lesen dient (`md:grid md:grid-cols-2 md:gap-4`), ab 1024 px Haupt- und Nebenteil (`lg:grid-cols-3`, Hauptteil zwei Spalten).
4. Weitere Aktionen als ruhige Knöpfe am Ende. Löschen steht zuletzt, ist rot nur im Bestätigungsdialog (`ConfirmDialog`) und sagt, was verloren geht.
5. Ein Eintrag, den es nicht mehr gibt (`useQueryResult` meldet `not_found`): `NotFoundPage`.

### H3. Formular

1. `PageHeader` mit Rücklink und Titel («Artikel erfassen», «Artikel bearbeiten»).
2. Ein Formular, höchstens `max-w-2xl`, in `Section`-Blöcken mit Überschrift. Pflichtfelder zuerst, Seltenes unter «Weitere Angaben».
3. Vorschläge sind vorbelegt (Lagerbereich und Haltbarkeit aus der Warengruppe, Mehrwertsteuer aus dem Betrieb) und als Vorschlag erkennbar.
4. `FormActions` mit «Sichern». Fehler stehen am Feld; die Meldung eines abgelehnten Befehls (`errorText`) steht über den Aktionen mit `role="alert"`.
5. Nach dem Sichern: zurück zur Detailseite, Toast «Gesichert».

### H4. Erfassen (Wareneingang, Abschreiber, Inventur, Produktion, Temperatur, Verkauf)

1. Schnell und mit dem Daumen: wenige Felder, grosse Ziele, das Übliche vorbelegt (heute, ganzer Rest, üblicher Lagerbereich).
2. Mengen mit `QuantityField`, Beträge mit `MoneyField`, Daten mit `DateField` und Schnellwahl.
3. Vor dem Buchen steht, was passiert, in einem Satz mit Zahlen («3 Chargen, CHF 412.60»).
4. Nach dem Buchen ein Toast mit dem Ergebnis; die Seite ist bereit für die nächste Erfassung oder führt zurück.
5. Was nicht aufgeht (zu wenig an Lager, Datum fehlt), blockiert nicht, sondern wird gezeigt und mitgebucht, wo die Regeln es erlauben (ADR-0007).

### H5. Auswertung (Cockpit, Zahlen, Berichte)

1. Zuerst die Antwort in einem Satz oder einer Leitzahl, dann das Diagramm, dann die Tabelle.
2. Jedes Diagramm hat einen Titel, der die Aussage nennt, und eine Zusammenfassung in Worten (`summary`).
3. Zeiträume mit `SegmentedControl` («7 Tage», «30 Tage», «Monat»), in der Adresse gehalten.
4. Unvollständige Grundlagen stehen dabei («3 Gerichte ohne Preis»), nie eine schöne Zahl auf lückenhaften Daten (ADR-0008).
5. Druckansicht über `window.print()` mit `print:`-Klassen: ohne Navigation, schwarz auf weiss, mit Betrieb und Datum.

### H6. Immer

- Texte nur in `features/<bereich>/messages.ts`. Zahlen, Geld, Mengen und Daten nur über die Helfer (Abschnitt B).
- Links nur über `paths`. Daten nur über `useQuery` und `useCommand`.
- Jede Seite hat genau ein `h1` (aus `PageHeader`), danach `h2` in `Section`.
- Am iPhone liegt das Ende jeder Seite frei über der Tab-Leiste; nichts scrollt seitwärts bei 390 px. Ab `md:` gibt es keine Tab-Leiste mehr, sondern die Leiste links.
- Seiten laden über `lazy` in `routes.tsx`, ausser dem Cockpit.
- Während eine Abfrage lädt, steht der Kopf der Seite; es flackert kein Ladezeichen.
