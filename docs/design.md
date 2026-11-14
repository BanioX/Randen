# Randen – Design-System

> **Leitbild (Alban, 12. und 14.11.2026):** «mehr Dunkelrot, premium wie Rotwein», die ruhige, genaue Geschäfts-Schwester von Rettich. Rotwein, Traube, Kork; Schrift in Onyx. Wirkt wie eine Weinkarte: ruhig, edel, für Profis.
> Umsetzung: Tokens in `apps/web/src/index.css` (`@theme`), Bausteine in `apps/web/src/ui/` ([`ui-kit.md`](ui-kit.md)), alles zusammen unter `/styleguide`.
> Kontrast: `pnpm contrast` prüft jedes Paar unten, hell und dunkel.

## Haltung

- **Premium statt laut:** Rotwein als Marke, Traube für die dunklen Flächen, Kork als warmer Begleiter, Onyx für Schrift. Viel Weissraum, keine Verläufe, keine Neon-Töne.
- **Ein Werkzeug, kein Prospekt:** Zahlen stehen in Tabellenziffern, Geld rechtsbündig, das Wichtigste zuoberst. Eine Hauptaktion pro Seite.
- **Vom Imbiss bis zur Grossküche:** Wer allein im Laden steht, kommt ohne Schulung zurecht; wer eine Brigade führt, findet die Tiefe.
- **Farbe trägt Bedeutung** und steht nie allein: immer mit Text oder Symbol.
- **Daumen und Schreibtisch:** am Handy wichtige Aktionen unten und Ziele mindestens 44 px; am Tablet und am Schreibtisch nutzt der Inhalt die Breite mit Spalten und Tabellen, nie ein gestrecktes Handy-Layout.
- **Immer sauber ausgerichtet:** In einer Fläche steht alles auf derselben Achse. Text wird nie angeschnitten.

## Farben

### Drei Töne (Albans Brief vom 14.11.2026)

| Ton | Wert | Token | Wofür |
| --- | --- | --- | --- |
| **Rotwein** | `#6D1F2F` | `wine-700` | Was du tippst und was gewählt ist: Knöpfe, gewähltes Segment, aktiver Eintrag, der ＋-Knopf. Weiss darauf 11.1:1 |
| **Traube** | `#3F0F1C` | `grape` (= `wine-900`) | Die dunklen Flächen: Seitenleiste und die eine dunkle Karte pro Seite, wie der Umschlag einer Weinkarte. Weiss darauf 16.2:1 |
| **Kork** | `#E8D9C0` | `cork` | Der warme Begleiter. Als Farbe nur auf Traube (Beschriftung, Auszeichnung «Beste Marge»); seine hellen Abstufungen sind Grund und ruhige Flächen der App |
| **Onyx** | `#14161A` | `ink` | Schrift, wie bei Rettich |

### Rotwein (OKLCH, Farbton 12°, gleichmässige Helligkeitsschritte)

| Stufe | 50 | 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900 | 950 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Wert | `#FEF3F3` | `#FDE4E6` | `#F3C4C8` | `#E79EA6` | `#D67784` | `#BD5566` | `#953447` | `#6D1F2F` | `#571825` | `#3F0F1C` | `#20070B` |

- **700** ist Rotwein selbst, **900** ist Traube. **600** ist der Fokusring, **800** weinroter Text auf hellen Flächen, **50** die Hinweis-Karte, **100** die Pille hinter dem aktiven Tab.

### Kork-Neutrale und Onyx

| Token | Hell | Dunkel | Wofür |
| --- | --- | --- | --- |
| `ground` | `#F9F5F0` | `#110A0B` | App-Hintergrund: ein Hauch Kork |
| `surface` | `#FFFFFF` | `#1F1718` | Karten, Listen, Tab-Leiste |
| `surface-muted` | `#F0EADF` | `#2F2525` | Segment-Spur, Symbol-Kacheln, ruhige Flächen |
| `line` | `#E3DACC` | `#3F3334` | Haarlinien |
| `line-strong` | `#877F72` | `#837671` | Ränder, die man sehen muss: Eingabefelder, leere Kontrollkästchen (3:1) |
| `cork` | `#E8D9C0` | `#E8D9C0` | Beschriftung und Auszeichnung auf Traube |
| `mist` | `#CFC3AE` | `#C1B6A2` | Ruhige Schrift auf Traube |
| `ink` | `#14161A` | `#F3F0EA` | Haupttext |
| `ink-muted` | `#605A50` | `#B7B0A5` | Nebentext |
| `grape` | `#3F0F1C` | `#42151D` | Seitenleiste und die eine dunkle Karte pro Seite |

Kork gibt der App die Wärme einer Weinkarte, ohne nach Papier auszusehen: Karten bleiben weiss, nur der Grund und die ruhigen Flächen tragen den Ton.

### Eine Bedeutung pro Farbe

| Farbe | Bedeutet | Token |
| --- | --- | --- |
| **Rotwein** | Was du tippst und was gewählt ist | `wine-700` |
| **Zinnober** | Was falsch ist: abgelaufen, ausserhalb der Temperatur, abgeschrieben, über dem Ziel | `danger` `#C33701`, Text auf `today-bg` |
| **Bernstein** | Bald: läuft in 1 bis 3 Tagen ab, knapp über dem Ziel | `soon` auf `soon-bg` |
| **Grün** | In Ordnung: Temperatur stimmt, Marge im Ziel | `ok` auf `ok-bg` |
| **Traube** | Ergebnis und Leitzahl: die eine dunkle Karte | `grape` |
| **Kork** | Alles andere | `surface-muted`, `ink-muted` |

**Die Marke ist rot, darum gilt:** Rotwein ist, was du tippst; Zinnober ist, was falsch ist. Zinnober ist klar heller und oranger als Rotwein (Farbton 36° statt 12°) und steht immer mit Wort oder Symbol («abgelaufen», Warndreieck). Ein Löschen-Knopf ist nur im Bestätigungsdialog zinnoberrot.

### Lagerbereiche

Je ein Ton, nur im Symbol und im Chip, nie als Kartenfläche: Kühlzelle `cold` (Petrol), Tiefkühlzelle `frozen` (Blau), Trockenlager `dry` (Weizen), Bar und Weinkeller `bar` (Pflaume). Posten und Anderes sind neutral.

### Diagramme

Sechs Reihen in fester Folge (`chart-1` bis `chart-6`): Rotwein, Petrol, Senf, Indigo, Salbei, Flieder. Sie unterscheiden sich auch in der Helligkeit, nicht nur im Farbton. Eine einzelne Reihe ist immer Rotwein. Status-Diagramme (im Ziel, bald, darüber) nutzen die Status-Farben. Im Dunkelmodus sind alle Reihen heller.

### Dunkelmodus

Folgt dem Gerät (`prefers-color-scheme`). Dieselben Tokens bekommen nachts andere Werte; Flächen mit weisser Schrift bleiben Flächen, Text in Rotwein, Grün und Zinnober wird heller (`#E79EA6`, `#81D39F`, `#FD9376`). Schatten werden zu einer feinen hellen Kante.

## Schrift

Systemschrift (SF Pro, Roboto, Segoe UI): Es wird nichts geladen, die Grössen in `rem` folgen der Textgrösse des Systems.

| Rolle | Grösse, Gewicht |
| --- | --- |
| Grosser Titel (`large-title`) | 34 px, 700 |
| Abschnittstitel | 20 px, 600 |
| Text und Bedienung | 17 px, 400/600 |
| Klein (Meta, Chips, Tabellenkopf) | 13 bis 14 px, 600 |
| Zahlen | `tabular-nums`, Geld rechtsbündig |

## Form, Tiefe, Bewegung

- Radien: 12 px (Eingaben, Knöpfe), 16 px (Karten, Listen), 24 px (Sheets), Pille für Chips.
- Karten weiss, ohne Rahmen, mit weichem Schatten (`shadow-card`); Schwebendes (`shadow-float`) etwas mehr.
- Bewegung 150 bis 200 ms, ease-out; `prefers-reduced-motion` schaltet sie ab.
- Symbole: Lucide, Linienstärke 1.75, 20 bis 22 px. Keine Emojis.

## iPhone, iPad, Web (ADR-0013)

| Gerät | Breite | Rahmen | Inhalt |
| --- | --- | --- | --- |
| iPhone | unter 768 px | Tab-Leiste unten mit fünf Zielen: Cockpit, Lager, ＋ Erfassen, Rezepte, Mehr | eine Spalte, höchstens `max-w-xl` |
| iPad hochkant | 768 bis 1023 px | schmale Leiste in Traube, 96 px: Symbol mit kleinem Wort für jeden Bereich | die volle Breite, Kennzahlen zu viert, Tabellen |
| iPad quer, Web | ab 1024 px | Seitenleiste in Traube, 256 px, mit allen Bereichen in Gruppen | bis `max-w-6xl`, Karten nebeneinander, Tabellen mit allen Spalten |

Die Seitenleiste gruppiert: Übersicht · Küche (Rezepte, Produktion, Menüplan, Speisekarte) · Lager (Lager, Einkauf, Wo ist was?, Artikel, Lieferanten) · Kontrolle (Zahlen, Selbstkontrolle) · Betrieb. Zuoberst steht «＋ Erfassen» in Kork.

Für Seiten heisst das: Klassen ohne Präfix sind das iPhone, `md:` ist das iPad hochkant, `lg:` das iPad quer und das Web. Ziele sind überall mindestens 44 px, Felder nie kleiner als 16 px, sichere Ränder sind eingerechnet.

## App-Symbol

Eine weisse Rande mit rosa Schulter und drei Blättern auf Rotwein `#6D1F2F` (`apps/web/public/icon.svg`): die Schwester des Rettichs auf Smaragd. Die PNG-Symbole entstehen mit `node apps/web/scripts/icons.ts`.

## Druck

Berichte, Bestellungen, Rezeptkarten und Speisekarten drucken über den Browser (`@media print`): ohne Navigation, schwarz auf weiss, mit Betrieb und Datum, Tabellen mit Haarlinien.
