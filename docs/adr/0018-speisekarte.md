# ADR-0018: Speisekarte aus den Rezepten, Gästeansicht auf dem Gerät, Export als Datei

- **Status:** angenommen, für Druck und Export in der installierten iOS-App ergänzt durch [ADR-0019](0019-drucken-und-sichern-ueber-pdf-und-teilen.md)
- **Datum:** 2026-11-15
- **Entscheid von:** Claude, als kleiner Entscheid nach [CLAUDE.md](../../CLAUDE.md), Arbeitsweise 1. Alban kann ihn ändern.
- **Betrifft:** [ADR-0006](0006-data-stays-on-the-device.md) (nichts verlässt das Gerät), [ADR-0008](0008-computed-not-stored.md) (berechnet, nie gespeichert), [ADR-0011](0011-no-partner-integrations.md) (Anbindungen an Gäste-Geräte), [ADR-0015](0015-betriebsarten-und-funktionen.md) (Funktion `menu_card`)

## Kontext

Die digitale Speisekarte mit Allergenen gehört zum Kern des Versprechens. Gäste sehen Gerichte, Preise, Fotos und Allergene; die Küche braucht dazu eine Matrix. Eine Karte darf keine eigene Kopie der Rezepte sein, sonst weicht sie vom Rezept ab, sobald jemand das Rezept ändert.

## Entscheid

1. **Ein Gericht ist ein Rezept der Art «Gericht».** Die Karte speichert nur ihre Abschnitte, die Verweise auf die Rezepte und den Preis. Allergene, Diäten, Herkunft und Marge rechnet die App aus dem Rezept (ADR-0008). Ändert sich ein Rezept, ändert sich die Karte; die Kartenzeile bleibt gleich.
2. **Fehlende Angaben stehen als offene Punkte da,** nicht als stille Lücke: Preis, Foto, Herkunft, Deklaration, gelöschtes Rezept. In der Gästeansicht erscheint am Gericht ein Hinweis «Angaben unvollständig».
3. **Gästeansicht** unter `/guest/:cardId`, ausserhalb des App-Rahmens. Die Filter «Vegetarisch», «Vegan» und «Ohne …» stehen in der Adresse, damit ein Bildschirm mit Filter nachvollziehbar bleibt. Eine unveröffentlichte Karte zeigt eine Seite «nicht gefunden», ausser mit `?preview=1`.
4. **Export** als eine eigenständige HTML-Datei: Stile im Dokument, Fotos als Datenadressen, kein Skript, keine fremde Adresse, `noindex`, `lang="de-CH"`. Die Datei verlässt das Gerät nur, wenn die Person sie selbst teilt (SE-10).
5. **Keine öffentliche Adresse und kein QR-Code in dieser Stufe.** Beides braucht eine öffentliche Adresse und einen Server; die Grenze dazu zieht ADR-0011. Die Gästeansicht läuft auf dem Gerät; geteilt wird über Export oder Druck.
6. **Funktion `menu_card`** (ADR-0015). Die Speisekarte hat ihren eigenen Eintrag, darum prüft das Modul kein `useDetailed`. Allergenliste und Gästeansicht gehören zu den Grundfunktionen.

## Folgen

- `menu.get` lädt die Fotos der Gerichte für die Miniaturen im Editor. Die Abfrage ist schwerer als eine Liste (TD-38).
- Die Texte der offenen Punkte stehen doppelt: im Export (`packages/core/src/modules/menu/html.ts`) und in `apps/web/src/features/menu/messages.ts`. Eine Änderung braucht beide Stellen (TD-41).
- Gedruckt wird im Browser über den Druckdialog des Geräts, in der installierten iOS-App als PDF über das Teilen-Menü (SE-07, SE-08, ADR-0019). Das Querformat auf dem iPad ist noch nicht geprüft (TD-40).

## Nicht entschieden

- Öffentliche Adresse und QR-Code.
- Ob ein Abschnitt ohne Rückgängig entfernt werden darf (TD-42).
