# Randen – Design-System

> **Leitbild:** die ruhige, genaue Geschäfts-Schwester von Rettich. Weinrot, warmer Stein, Onyx. Premium statt laut.
> Umsetzung: Tokens in `apps/web/src/index.css` (`@theme`), Bausteine in `apps/web/src/ui/` ([`ui-kit.md`](ui-kit.md)), alles zusammen unter `/styleguide`.
> Kontrast: `pnpm contrast` prüft jedes Paar unten, hell und dunkel.

## Haltung

- **Premium statt laut:** Weinrot als Marke, warmer Stein als Grund, Onyx für Schrift, Seitenleiste und die eine dunkle Karte. Viel Weissraum, keine Verläufe, keine Neon-Töne.
- **Ein Werkzeug, kein Prospekt:** Zahlen stehen in Tabellenziffern, Geld rechtsbündig, das Wichtigste zuoberst. Eine Hauptaktion pro Seite.
- **Farbe trägt Bedeutung** und steht nie allein: immer mit Text oder Symbol.
- **Daumen und Schreibtisch:** am Handy wichtige Aktionen unten und Ziele mindestens 44 px; am Tablet und am Schreibtisch nutzt der Inhalt die Breite mit Spalten und Tabellen, nie ein gestrecktes Handy-Layout.
- **Immer sauber ausgerichtet:** In einer Fläche steht alles auf derselben Achse. Text wird nie angeschnitten.

## Farben

### Weinrot (OKLCH, Farbton 10°, gleichmässige Helligkeitsschritte)

| Stufe | 50 | 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900 | 950 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Wert | `#FDF3F4` | `#FCE4E7` | `#EFBEC4` | `#E496A1` | `#D46E80` | `#BF4761` | `#A02647` | `#791432` | `#5F0C25` | `#46071A` | `#2C060F` |

- **700** `#791432` ist die Aktionsfarbe: Knöpfe, gewähltes Segment, aktiver Eintrag der Navigation, der ＋-Knopf. Weiss darauf 10.7:1.
- **600** ist der Fokusring, **800** weinroter Text auf hellen Flächen, **50** die Hinweis-Karte, **100** die Pille hinter dem aktiven Tab.

### Stein und Onyx

| Token | Hell | Dunkel | Wofür |
| --- | --- | --- | --- |
| `ground` | `#F7F4F2` | `#0F0B0C` | App-Hintergrund |
| `surface` | `#FFFFFF` | `#1D1819` | Karten, Listen, Tab-Leiste |
| `surface-muted` | `#EEEAE8` | `#2C2627` | Segment-Spur, Symbol-Kacheln, ruhige Flächen |
| `line` | `#E0DBD8` | `#3B3334` | Haarlinien |
| `line-strong` | `#8B827F` | `#7E7573` | Ränder, die man sehen muss: Eingabefelder, leere Kontrollkästchen (3:1) |
| `mist` | `#C5BBB8` | `#B9AEAD` | Schrift und Linien auf Onyx |
| `ink` | `#1B1415` | `#F2EFEE` | Haupttext |
| `ink-muted` | `#685E5C` | `#B3AAA9` | Nebentext |
| `onyx` | `#170E0F` | `#342B2C` | Seitenleiste und die eine dunkle Karte pro Seite |

Der Stein ist ein warmes Grau mit sehr wenig Farbe: Er lässt Weinrot teuer wirken, ohne nach Papier auszusehen.

### Gold

`gold` `#DAB975` steht **nur auf Dunkel**: als kleine Auszeichnung auf der Onyx-Karte (die Leitzahl) und als Marke «Beste Marge» (`gold` auf `gold-bg`). Nie als Fläche, nie auf Weiss.

### Eine Bedeutung pro Farbe

| Farbe | Bedeutet | Token |
| --- | --- | --- |
| **Weinrot** | Was du tippst und was gewählt ist | `wine-700` |
| **Zinnober** | Was falsch ist: abgelaufen, ausserhalb der Temperatur, abgeschrieben, über dem Ziel | `danger` `#C33701`, Text auf `today-bg` |
| **Bernstein** | Bald: läuft in 1 bis 3 Tagen ab, knapp über dem Ziel | `soon` auf `soon-bg` |
| **Grün** | In Ordnung: Temperatur stimmt, Marge im Ziel | `ok` auf `ok-bg` |
| **Onyx** | Ergebnis und Leitzahl | `onyx` |
| **Stein** | Alles andere | `surface-muted`, `ink-muted` |

**Die Marke ist rot, darum gilt:** Weinrot ist, was du tippst; Zinnober ist, was falsch ist. Zinnober ist klar heller und oranger als Weinrot (Farbton 36° statt 10°) und steht immer mit Wort oder Symbol («abgelaufen», Warndreieck). Ein Löschen-Knopf ist nur im Bestätigungsdialog zinnoberrot.

### Lagerbereiche

Je ein Ton, nur im Symbol und im Chip, nie als Kartenfläche: Kühlraum `cold` (Petrol), Tiefkühler `frozen` (Blau), Trockenlager `dry` (Weizen), Bar und Keller `bar` (Pflaume).

### Diagramme

Sechs Reihen in fester Folge (`chart-1` bis `chart-6`): Weinrot, Petrol, Senf, Indigo, Salbei, Flieder. Sie unterscheiden sich auch in der Helligkeit, nicht nur im Farbton. Eine einzelne Reihe ist immer Weinrot. Status-Diagramme (im Ziel, bald, darüber) nutzen die Status-Farben. Im Dunkelmodus sind alle Reihen heller.

### Dunkelmodus

Folgt dem Gerät (`prefers-color-scheme`). Dieselben Tokens bekommen nachts andere Werte; Flächen mit weisser Schrift bleiben Flächen, Text in Weinrot, Grün und Zinnober wird heller (`#E496A1`, `#81D39F`, `#FD9376`). Schatten werden zu einer feinen hellen Kante.

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

## Drei Breiten

| Breite | Gerät | Rahmen | Inhalt |
| --- | --- | --- | --- |
| 390 px | Handy | Tab-Leiste unten mit fünf Zielen: Cockpit, Lager, ＋ Erfassen, Rezepte, Mehr | eine Spalte, höchstens `max-w-xl` |
| 820 px | Tablet hoch | Tab-Leiste | eine breite Spalte (`max-w-3xl`), Kennzahlen zu viert |
| ab 1024 px | Tablet quer, Schreibtisch | Seitenleiste in Onyx, 256 px, mit allen Bereichen in Gruppen | bis `max-w-6xl`, Karten nebeneinander, Tabellen mit allen Spalten |

Die Seitenleiste gruppiert: Übersicht · Küche (Rezepte, Produktion, Menüplan, Speisekarte) · Lager (Lager, Einkauf, Wo ist was?, Artikel, Lieferanten) · Kontrolle (Zahlen, Selbstkontrolle) · Betrieb.

## App-Symbol

Eine weisse Rande mit rosa Schulter und drei Blättern auf Weinrot `#791432` (`apps/web/public/icon.svg`): die Schwester des Rettichs auf Smaragd. Die PNG-Symbole entstehen mit `node apps/web/scripts/icons.ts`.

## Druck

Berichte, Bestellungen, Rezeptkarten und Speisekarten drucken über den Browser (`@media print`): ohne Navigation, schwarz auf weiss, mit Betrieb und Datum, Tabellen mit Haarlinien.
