# ADR-0011: Keine Anbindungen an Kasse, Lieferanten und Gäste-Geräte

- **Status:** angenommen
- **Datum:** 2026-11-14

## Kontext

Eine Rundum-Lösung lebt von Verbindungen: Verkäufe aus der Kasse, Bestellungen an Lieferanten, die Speisekarte auf dem Handy der Gäste. Jede dieser Verbindungen lässt Betriebsdaten das Gerät verlassen oder braucht Verträge und Konten bei Dritten.

## Entscheid

Randen baut diese Verbindungen nicht, sondern die Stelle, an der sie später andocken:

| Bereich | Heute | Später möglich (Albans Entscheid) |
| --- | --- | --- |
| Verkäufe | Von Hand erfassen: Portionen pro Gericht und Tag, Umsatz ohne Rezept | Import des Tagesabschlusses einer Kasse |
| Bestellungen | Randen schreibt die Bestellung; die Person kopiert, teilt oder druckt sie | Übermittlung an Lieferanten |
| Speisekarte | Gästeansicht auf einem Gerät des Betriebs, Druck, Speichern als eine Datei | Öffentliche Adresse mit QR-Code |
| Menüplan | Vorschlag nach festen Regeln auf dem Gerät (Ablauf, Bestand, Marge) | – |
| Mehrere Geräte | Sicherung als Datei von Gerät zu Gerät | Konten und Sync |

Der automatische Menüvorschlag rechnet nach offenen, festen Regeln auf dem Gerät. Es wird kein fremder Dienst und kein Sprachmodell aufgerufen.

## Konsequenzen

- Nichts kostet laufend Geld, nichts verlässt das Gerät ohne Zutun der Person.
- Die Schnittstelle (ADR-0005) ist so gebaut, dass ein Import oder eine Übermittlung ein weiterer Aufrufer derselben Befehle wäre.
