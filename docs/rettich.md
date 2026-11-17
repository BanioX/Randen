# Was Randen aus Rettich übernimmt

**Erlaubnis (Alban, 15.11.2026):** Claude darf Funktionen aus Rettich (`BanioX/Rettich`, früher `BanioX/FridgeAI`) laufend kopieren und an die Küche anpassen, wenn sie nützen. Claude entscheidet jeweils nach Nützlichkeit und hält den Entscheid hier fest.

**Regeln:**

- Jede Übernahme nennt im ADR oder Commit die Quelle (Rettich-ADR oder PR).
- Übernommen wird, was einer Küche hilft; Haushalts-Begriffe werden zu Küchen-Begriffen ([`glossar.md`](glossar.md)).
- Rettich ist öffentlich: Von Randen fliesst nichts zurück, weder Code noch Strategie noch Namen (CLAUDE.md, Arbeitsweise 5).
- Rettich ist proprietär und gehört Alban, wie Randen. Fremder Code mit unklarer Lizenz wird auch über diesen Weg nicht übernommen.

## Stand

| Rettich | Rettich-ADR | Entscheid für Randen | Stand |
| --- | --- | --- | --- |
| Drei Schichten, Contract-first, local-first, Geld als Ganzzahl | 0003, 0004, 0005, 0034 | übernommen | Randen ADR-0003 bis 0005 |
| Datumsfeld als Text mit Kalender-Knopf, Datum vom Zürcher Tag | 0062, L-16, L-20 | übernommen | UI-Kit |
| Dunkelmodus nach Gerät, eine Bedeutung pro Farbe | 0075, 0081 | übernommen | ADR-0009 |
| Plätze mit Foto, Foto gross | 0056, 0082 | übernommen, für Kühlzelle und Posten | Modul «Wo ist was?» |
| Seitenleiste auf iPad und Rechner, Sheets als Dialoge | 0092, 0093 | übernommen | ADR-0013 |
| Grundfunktionen und Erweitert | 0095 | übernommen | ADR-0014 |
| Seitenübergänge wie auf dem iPhone | 0088 | übernommen; die Hauptbereiche der Seitenleiste blenden über wie Tabs | 15.11.2026 |
| Zurückwischen vom linken Rand (installierte App) | 0091 | übernommen; abgewichen: Ein Schritt, den das System macht (die Geste von iOS 27, der Zurück-Knopf des Browsers), wechselt die Seite ohne zweite Bewegung (ADR-0021) | 15.11.2026, 17.11.2026 |
| Kurzbefehle am App-Symbol | 0094 | übernommen: «Wareneingang», «Abschreiben», «Temperatur» (Android und Rechner; iOS kennt sie nicht) | 15.11.2026 |
| Sicherung mit Passwort | 0087 | übernommen: Sicherung als Datei, auf Wunsch mit Passwort verschlüsselt (PBKDF2 mit 600'000 Runden, AES-GCM; `features/settings/backup-crypto.ts` nach Rettichs `app/backup-crypto.ts`) | ADR-0017 (Entwurf), 15.11.2026 |
| PDF auf dem Gerät mit jsPDF, Teilen mit Download als Rückfall, PDFs hell für Papier | 0030, 0081, TD-15 | übernommen: Kit in Randens Farben (`ui/pdf/`), Teilen-Menü statt Druckdialog und Download in der installierten iOS-App (`ui/share-file.ts`, `ui/print.ts`); erstes PDF ist die Speisekarte für Gäste | ADR-0019, 16.11.2026 |
| App-Sperre mit Face ID | 0086 | später: sinnvoll, sobald Mitarbeitende dasselbe Gerät nutzen | offen |
| Quittung lesen (Texterkennung, PDF) | 0027, 0028 | anpassen: Lieferschein und Rechnung des Grosshändlers lesen | nach den Modulen |
| Barcode scannen | 0014 | übernehmen: Wareneingang und Inventur | nach den Modulen |
| Mengen auf einem Rad | 0083 | prüfen: am iPhone für Inventur | offen |
| Klimabilanz | 0057 | später: Bericht für Kantinen | offen |
| Wochenrückblick, Kalender-Erinnerung | 0090 | anpassen: Wochenbericht der Küche | offen |
| Ferien-Check | 0069 | anpassen: Betriebsferien und Ruhetage | offen |
| Mindestbestand, «bald wieder nötig» | 0059, 0070 | übernommen als Mindest- und Sollbestand; Rhythmus später | Modul «Einkauf» |
| Abzeichen, wachsender Rettich, Retten als Ritual | 0042, 0043, 0054, 0084 | nicht übernommen: passt nicht zu einem Werkzeug für Profis | – |
| Laden-Buchstaben, Open Food Facts, Nährwerte | 0037, 0016, 0064 | nicht jetzt: Grosshandel statt Detailhandel | – |
| Feedback-Frage nach einer Woche | 0089 | später, mit dem ersten Pilotbetrieb | offen |

## Gemeinsamer Kern (Kopie)

Fünf Dateien in `packages/core/src` stammen aus Rettich (dort ebenfalls `packages/core/src`). Sie werden kopiert, nicht geteilt (ADR-0020): Ein gemeinsames Kern-Paket wartet auf den Namen der Firma und einen Server.

Gemessen am 16.11.2026 mit `diff` je Datei gegen Rettich, Stand `a84ffda9` vom 14.11.2026; `main` von Rettich (`0ac1fd2e`, 15.11.2026) hat dieselben fünf Dateien.

| Datei | Zeilen (beide) | Stand |
| --- | --- | --- |
| `ids.ts` | 63 | gleich |
| `format.ts` | 25 | gleich |
| `money.ts` | 160 | Code gleich; 2 Zeilen im Kopfkommentar verschieden («in Randen» statt «in rettich», Verweis auf ADR-0004) |
| `currency.ts` | 128 | Code gleich; 4 Kommentarzeilen verschieden (eine Währung pro Betrieb statt pro Haushalt, ADR-0004 statt Rettich-ADR-0019, Name des Typs `Rappen`, «business» statt «household») |
| `dates.ts` | 168 | Code gleich; 2 Kommentarzeilen verschieden («in Randen» statt «in rettich», ohne Verweis auf einen Schritt im Plan von Rettich) |

- Ändert Rettich eine dieser Dateien, zieht Randen nach und hält den neuen Stand hier fest. Von Randen fliesst nichts zurück.
- Den Vermerk der Herkunft tragen die Dateien heute nicht in ihrem Kopf; er steht nur hier. Nachtragen, wenn `packages/core` das nächste Mal geändert wird.
