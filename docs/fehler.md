# Bekannte Fehler

Stand 17.11.2026. Fehler, die gefunden, aber noch nicht behoben sind. Bewusste Abkürzungen stehen in [`schulden.md`](schulden.md), Lektionen im [`lernbuch.md`](lernbuch.md). Wer einen Fehler behebt, streicht ihn hier und nennt den Commit.

**Woher:** Ein Code-Review vom 16.11.2026 über die Module, die beim Review der Welle 3 nicht dabei waren (Lager, Stammdaten, Rezepte, Produktion, Einkauf, Cockpit und Demo, Betrieb und Sicherung, Rahmen und Eingabefelder). Jeder Befund wurde von einer zweiten Prüfung gegengelesen, meist mit einem Test oder Skript, das den Fehler zeigt. Ein Befund wurde dabei widerlegt.

**Risiko:** hoch = falsche Angaben zu Allergenen oder Selbstkontrolle, Datenverlust oder ein Hauptablauf, der nicht aufgeht · mittel = falsche Zahl oder irreführende Anzeige auf einem Nebenweg · tief = Schönheitsfehler.

## Bestätigt (29)

| Nr. | Bereich | Fehler | Risiko | Ort |
| --- | --- | --- | --- | --- |
| F-01 | Lager | Inventur: Zählungen, die in einem anderen Lagerbereich getippt wurden, gehen beim Abschliessen ohne Hinweis verloren | mittel | `apps/web/src/features/stock/CountPage.tsx:233` |
| F-02 | Lager | Inventur: Gefundene Ware zählt in Zahlen und Cockpit nicht als Inventurdifferenz (Monatsbericht CHF 0.80 statt CHF 140.80) | mittel | `packages/core/src/modules/stock/use-cases.ts:847` |
| F-03 | Lager | Eine Inventur mit früherem Datum setzt den heutigen Bestand auf den alten Zählwert zurück und macht spätere Entnahmen rückgängig | mittel | `packages/core/src/modules/stock/use-cases.ts:821` |
| F-04 | Lager | Wareneingang «als Betrag»: Gebucht wird ein gerundeter Betrag, nicht der Betrag des Lieferscheins (drei Zeilen: CHF 1.35 Abweichung); ein Test hält CHF 9.99 statt CHF 10.00 fest | mittel | `packages/core/src/modules/stock/use-cases.ts:472` |
| F-05 | Lager | Verschieben eines Teils einer Charge, die eine Inventur erhöht hat, scheitert mit «Das hat nicht geklappt» | mittel | `packages/core/src/application/stock-ledger.ts:377` |
| F-06 | Stammdaten | **Import «Mehrere auf einmal» legt Artikel als allergenfrei an.** Ein Gericht aus Crevetten und Rahm erscheint auf der Speisekarte ohne Allergene und als vegetarisch | hoch | `packages/core/src/modules/articles/use-cases.ts:849` |
| F-07 | Stammdaten | **Ein Markt (Cash & Carry) lässt sich nur über die Demo anlegen**, nicht von Hand; Einkaufsliste und Einkauf im Markt bleiben für einen echten Betrieb leer | hoch | `packages/core/src/modules/articles/contract.ts:488` |
| F-08 | Stammdaten | Die Einheit eines Artikels lässt sich ändern, während offene Bestellungen und die Einkaufsliste noch die alte Einheit tragen | mittel | `packages/core/src/modules/articles/use-cases.ts:680` |
| F-09 | Stammdaten | Ein gelöschter Lagerbereich fällt mit seinen Temperaturen aus dem Bericht der Selbstkontrolle | mittel | `packages/core/src/modules/areas/use-cases.ts:588` |
| F-10 | Stammdaten | Der Preisverlauf zählt jeden verschobenen Teil einer Charge als eigenen Einkauf | mittel | `packages/core/src/modules/articles/use-cases.ts:380` |
| F-11 | Rezepte | Ein von Hand gesetztes Allergen verschwindet, wenn man einen anderen Allergen-Knopf antippt und eine Zutat dasselbe Allergen mitbringt | mittel | `apps/web/src/features/recipes/RecipeFormPage.tsx:913` |
| F-12 | Rezepte | Allergene am Artikel einer Eigenproduktion gelangen in die Gerichte; wird ein Allergen an einem Einkaufsartikel entfernt, erreicht das die Gerichte nicht | mittel | `packages/core/src/domain/declaration.ts:74` |
| F-13 | Rezepte | Marge und Wareneinsatz erscheinen als sichere Zahl, obwohl ein Preis fehlt (gegen ADR-0008) | mittel | `packages/core/src/domain/costing.ts:220` |
| F-14 | Rezepte | Der Preisvorschlag verfehlt nach dem Runden das Ziel knapp; das Gericht bleibt gelb und bekommt denselben Vorschlag wieder | tief | `packages/core/src/domain/costing.ts:170` |
| F-15 | Rezepte | Eine Komponente in Stück trägt die Überschrift «Kosten pro 1000 Stück», zeigt aber den Preis eines Stücks | tief | `apps/web/src/features/recipes/RecipeDetailPage.tsx:60` |
| F-16 | Produktion | **Der Wochenbedarf zählt Ware als verfügbar, deren Verbrauchsdatum vor dem geplanten Tag liegt**; Plan und Bestellvorschlag widersprechen sich | hoch | `packages/core/src/modules/production/plan-use-cases.ts:199` |
| F-17 | Produktion | «Woche füllen» plant ablaufende Ware ein, die schon geplante Einträge brauchen | mittel | `packages/core/src/modules/production/plan-use-cases.ts:626` |
| F-18 | Produktion | «Woche füllen» setzt im Notfall jedes Gericht in jede Mahlzeit, auch einen Hauptgang zum Frühstück | mittel | `packages/core/src/modules/production/suggest.ts:359` |
| F-19 | Produktion | Code auf dem Etikett und rückverfolgter Code weichen ab, sobald die Charge einer Produktion verschoben wird | mittel | `packages/core/src/modules/production/production-runs.ts:464` |
| F-20 | Einkauf | Der Bestell-Entwurf rundet eine Menge, die keine ganzen Packungen ergibt, und zeigt eine andere Bestellung als die gespeicherte und verschickte | mittel | `apps/web/src/features/purchasing/OrderPage.tsx:160` |
| F-21 | Einkauf | Die Preisbeobachtung zählt einen verschobenen Teil einer Aktionscharge als normalen Einkauf | mittel | `packages/core/src/modules/purchasing/rules.ts:353` |
| F-22 | Einkauf | Einkauf im Markt: Jede Temperatur beim Abholen gilt als «in Ordnung», ohne dass jemand sie beurteilt | mittel | `packages/core/src/modules/purchasing/use-cases.ts:1094` |
| F-23 | Einkauf | Eine Zeile der Einkaufsliste für einen gelöschten Markt lässt sich weder sehen noch abhaken noch entfernen | mittel | `packages/core/src/modules/purchasing/use-cases.ts:735` |
| F-24 | Einkauf | Die Einkaufsliste zeigt Bestand 0 für eine Zeile, deren Artikel nicht im Vorschlag steht | tief | `packages/core/src/modules/purchasing/use-cases.ts:705` |
| F-25 | Demo | **Die Demo hält einen Betrieb mit eigenen Aufzeichnungen der Selbstkontrolle für leer**, und «Demo entfernen» löscht diese Aufzeichnungen mit | hoch | `packages/core/src/modules/demo/use-cases.ts:184` |
| F-26 | Cockpit | Die Zeile «Unter Mindestbestand» rechnet anders als der Bestellvorschlag, auf den sie verweist | mittel | `packages/core/src/modules/cockpit/use-cases.ts:207` |
| F-27 | Rahmen | «Heute» wechselt um Mitternacht nicht, solange die App offen und sichtbar bleibt | mittel | `apps/web/src/app/AppData.tsx:116` |
| F-28 | Cockpit | Das leere Cockpit eines neuen Betriebs blendet die Zeilen der Selbstkontrolle aus | tief | `apps/web/src/features/cockpit/CockpitPage.tsx:53` |
| F-29 | Demo | Das Einkaufsbudget des laufenden Monats in der Demo wird aus einem einzigen Tag hochgerechnet | tief | `packages/core/src/modules/demo/build.ts:976` |

## Gefunden, Gegenprüfung offen (9)

Die zweite Prüfung dieser Befunde brach am Nutzungslimit ab. Sie gelten erst als Fehler, wenn sie nachgeprüft sind.

| Nr. | Bereich | Befund | Risiko laut Fund | Ort |
| --- | --- | --- | --- | --- |
| U-01 | Betrieb | Das Formular «Betrieb» startet mit dem Stand beim Start der App; Sichern kann das Einrichten und frühere Änderungen zurücksetzen | hoch | `apps/web/src/features/settings/BusinessPage.tsx:49` |
| U-02 | Sicherung | Wiederherstellen übernimmt die aktive Person der Sicherung nicht; eine entfernte Person bucht weiter | mittel | `apps/web/src/features/settings/RestoreSection.tsx:195` |
| U-03 | Team | Die handelnde Person lässt sich ausschalten, obwohl ihr Entfernen verweigert wird | mittel | `packages/core/src/modules/settings/use-cases.ts:87` |
| U-04 | Sicherung | «Alles löschen» behält den Tag der letzten Sicherung | tief | `apps/web/src/features/settings/DeleteSection.tsx:37` |
| U-05 | Sicherung | Eine passwortgeschützte Sicherung einer neueren Version heisst «beschädigt» statt «zu neu» | tief | `apps/web/src/features/settings/backup-crypto.ts:112` |
| U-06 | Eingabe | Eine getippte Einheit ändert nur die Anzeige; wird sie wieder gelöscht, liest der verborgene Schalter kg/l die Zahl 1000-fach falsch | mittel | `apps/web/src/ui/QuantityField.tsx:143` |
| U-07 | Rahmen | Zurückwischen vom linken Rand verlässt die Seite, auch wenn ein Sheet offen ist | mittel | `apps/web/src/app/use-edge-swipe-back.ts:48` |
| U-08 | Eingabe | Ein Datum ohne Jahr landet Anfang Januar im nächsten Dezember; der 29.02. wird in einem Jahr ohne Schalttag verweigert | tief | `packages/core/src/dates.ts:150` |
| U-09 | Eingabe | Das Zahlenfeld liest «1.000» oder «1,000» still als 1, statt nachzufragen | tief | `apps/web/src/ui/NumberField.tsx:20` |

Ein zehnter Fund (Mitternacht im Rahmen) ist derselbe Fehler wie F-27.

## Auf dem Gerät gefunden

| Nr. | Fehler | Stand |
| --- | --- | --- |
| G-01 | «Drucken» tut in der installierten App auf iPhone und iPad nichts. Ursache ist ein Fehler von Apple seit iOS 27 (WebKit-Bug 327504): `window.print()` bleibt dort stumm, im Safari-Tab druckt dieselbe Seite. Betroffen sind alle 13 Druckknöpfe (Alban, 16.11.2026) | in Arbeit: PDF auf dem Gerät und Teilen-Blatt, Speisekarte zuerst (ADR-0019) |

## Noch nicht geprüft

Die Fehlersuche im Browser, Bereich für Bereich auf iPhone- und Desktop-Grösse, brach am 16.11.2026 am Nutzungslimit ab, bevor sie Ergebnisse lieferte. Sie wird wiederholt.
