# ADR-0021: Zurück durch das System ohne zweite Bewegung

- **Status:** angenommen
- **Datum:** 2026-11-17
- **Entscheid von:** Claude, als kleiner Entscheid nach [CLAUDE.md](../../CLAUDE.md), Arbeitsweise 1. Alban kann ihn ändern.
- **Betrifft:** [ADR-0013](0013-iphone-ipad-web.md) (Seitenübergänge und Zurückwischen nach Rettich-ADR-0088 und Rettich-ADR-0091)

## Kontext

Alban, 17.11.2026, mit einer Bildschirmaufnahme aus der installierten App auf dem iPhone: «Wenn man zurückwischt, ist es nicht so flüssig wie Rettich, sondern leicht buggy.» Die Aufnahme, in Einzelbilder zerlegt (30 Bilder pro Sekunde), zeigt beim Wisch von «Lager» zurück zu «Rezepte»:

1. iOS schiebt «Lager» mit seiner eigenen Geste hinaus, dahinter liegt «Rezepte» abgedunkelt. Das ist die Zurück-Geste des Systems mit einer Momentaufnahme der Seite dahinter. Rettichs ADR-0091 ging am 13.11.2026 davon aus, dass eine installierte Web-App diese Geste nicht hat. Unter iOS 27 hat sie sie.
2. «Rezepte» steht, dann erscheint «Lager» für etwa zwei Bilder wieder und gleitet ein zweites Mal hinaus.

Ursache: React Router spielt bei einem Schritt zurück im Verlauf die View Transition des Hinwegs noch einmal ab (`appliedViewTransitions` in `react-router`), und Randen gab diesem Schritt die Bewegung `back`. In Randen tritt das oft auf: Jeder Bereich der Seitenleiste ist eine Hauptseite. Dort beginnt Randens eigene Randgeste nicht, und die Geste von iOS übernimmt.

## Entscheid

1. Randen bewegt eine Seite nur bei einem eigenen Schritt: Link, Knopf, `navigate(-1)` und die eigene Randgeste (`swipe`).
2. Ein Schritt im Verlauf, den das System macht (die Geste von iOS, die Zurück-Taste oder das Wischen im Browser, die Zurück-Geste von Android), bekommt `data-transition="none"`. Die alte Seite verschwindet sofort, die neue steht ohne Bewegung (`index.css`).
3. Die Regel steht in `apps/web/src/app/page-transition.ts`, die Tests in `page-transition.test.ts`.

## Folgen

- Nach der Geste von iOS läuft keine zweite Bewegung mehr. Am Computer wechselt die Seite beim Zurück-Knopf des Browsers ohne Bewegung, wie Browser es tun.
- Auf dem Gerät zu prüfen: Auf tieferen Seiten (zum Beispiel einem Artikel) beginnt weiter Randens eigene Randgeste. Hat iOS 27 auch dort seine Geste, begegnen sich zwei Gesten. Dann überlässt Randen das Zurückwischen ab iOS 27 dem System; das ist ein eigener Entscheid.
- Rettich hat dieselbe Logik. Diese Korrektur fliesst nicht ins öffentliche Rettich-Repo (CLAUDE.md, Arbeitsweise 7).
