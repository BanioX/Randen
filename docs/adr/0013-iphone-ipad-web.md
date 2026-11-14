# ADR-0013: Eine App für iPhone, iPad und Web

- **Status:** angenommen
- **Datum:** 2026-11-14

## Kontext

Alban (14.11.2026): «für iPhone / iPad / Web optimieren». Eine Küche nutzt Randen an drei Orten: das iPhone in der Hand im Lager und am Wareneingang, das iPad am Pass und an der Wand, den Browser im Büro für Zahlen, Rezepte und Bestellungen. Es ist eine einzige App (PWA), kein Download aus einem Store.

## Entscheid

### Drei Rahmen, ein Inhalt

| Gerät | Breite | Navigation | Inhalt |
| --- | --- | --- | --- |
| **iPhone** | unter 768 px | Tab-Leiste unten mit fünf Zielen: Cockpit, Lager, ＋ Erfassen, Rezepte, Mehr | eine Spalte, das Wichtige unten in Daumenreichweite |
| **iPad hochkant** | 768 bis 1023 px | schmale Leiste in Traube (96 px): Symbol mit kleinem Wort, jeder Bereich einen Tipp entfernt | die volle Breite für Tabellen und zwei Spalten |
| **iPad quer und Web** | ab 1024 px | Seitenleiste in Traube (256 px) mit Gruppen | bis 1152 px breit, Karten nebeneinander, Tabellen mit allen Spalten |

«＋ Erfassen» ist auf allen dreien einen Tipp entfernt: als mittlerer Tab am iPhone, als Knopf in Kork zuoberst in Leiste und Seitenleiste.

### iPhone und iPad

1. **Installierbar:** «Zum Home-Bildschirm» öffnet Randen im Vollbild mit eigenem Symbol (Manifest, `apple-touch-icon`, `apple-mobile-web-app-capable`). Keine Ausrichtung wird erzwungen.
2. **Sichere Ränder:** Notch, Home-Balken und runde Ecken sind überall eingerechnet (`viewport-fit=cover`, `env(safe-area-inset-*)`), auch quer.
3. **Kein Zoom beim Tippen:** Kein Eingabefeld ist kleiner als 16 px (globale Regel in `index.css`); die Textgrösse des Systems gilt (alles in `rem`).
4. **Tippen ohne Verzögerung:** `touch-action: manipulation` auf allem, was man tippt; Ziele mindestens 44 px, auch am iPad und im Web, weil das iPad quer denselben Rahmen wie der Browser hat.
5. **Tastaturen:** Zahlenfelder öffnen die Zifferntastatur (`inputmode`), der Zeilenschalter sagt, was er tut (`enterkeyhint`).
6. **Kamera und Fotos:** nur nach einem Tipp, mit «Aus Dateien wählen» als zweitem Weg.
7. **Kein Hover nötig:** Alles, was beim Überfahren erscheint, ist auch ohne Maus erreichbar. Hover-Stile greifen nur auf Geräten mit Zeiger.
8. **Lang drücken und Wischen** sind nie der einzige Weg zu einer Aktion.

### Web

1. **Tastatur:** Jede Seite ist ohne Maus bedienbar, mit sichtbarem Fokus und einem Sprung zum Inhalt.
2. **Breite nutzen:** Tabellen statt Listen, wo Zahlen verglichen werden; Formulare bleiben schmal und lesbar.
3. **Drucken** über den Browser für Berichte, Bestellungen, Rezeptkarten, Etiketten und Speisekarten.
4. **Titel im Browser-Tab** pro Seite.

### Prüfen

- E2E und axe laufen in vier Ansichten: iPhone (390 × 844), iPad hochkant (820 × 1180), iPad quer (1180 × 820), Web (1440 × 900), hell und dunkel. Nichts scrollt seitwärts, nichts liegt hinter Leisten.
- `pnpm preview:shots` zeigt jede Route in diesen Ansichten nebeneinander.
- **Chromium ist nicht Safari** (Lektion aus Rettich, L-28): Gesten, Kamera, Home-Bildschirm und Tastatur nimmt Alban auf einem echten iPhone und iPad ab.

## Konsequenzen

- Jede Seite wird in allen vier Ansichten gebaut und angeschaut (Definition of Done).
- Kein Startbild (Splash) für iOS und keine Tastaturkürzel: als Schuld eingetragen.
- Eine App im App Store ist später mit derselben Codebasis möglich (Capacitor); das kostet Geld und ist Albans Entscheid.
