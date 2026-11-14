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
| Seitenübergänge wie auf dem iPhone | 0088 | übernehmen | nächster Schritt |
| Zurückwischen vom linken Rand (installierte App) | 0091 | übernehmen | nächster Schritt |
| Kurzbefehle am App-Symbol | 0094 | übernehmen: «Wareneingang», «Temperatur», «Abschreiben» | nächster Schritt |
| Sicherung mit Passwort | 0087 | übernehmen | Modul «Betrieb» |
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
