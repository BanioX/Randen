# ADR-0019: Drucken und Sichern über PDF und Teilen

- **Status:** angenommen
- **Datum:** 2026-11-16
- **Entscheid von:** Claude, als kleiner Entscheid nach [CLAUDE.md](../../CLAUDE.md), Arbeitsweise 1. Alban kann ihn ändern.
- **Betrifft:** [ADR-0002](0002-tech-stack-and-tooling.md) (ergänzt: eine PDF-Bibliothek für den Druck), [ADR-0006](0006-data-stays-on-the-device.md) (nichts verlässt das Gerät), [ADR-0013](0013-iphone-ipad-web.md) (iPhone, iPad und Web), [ADR-0018](0018-speisekarte.md) (Gästeansicht und Export)

## Kontext

Alban tippte in der installierten App auf dem iPhone in der Gästeansicht (`/guest/:cardId`) auf «Drucken». Es geschah nichts.

- **Drucken:** Seit iOS und iPadOS 27 tut `window.print()` in einer Web-App, die vom Home-Bildschirm startet, nichts: kein Druckdialog, kein Fehler, keine Ereignisse `beforeprint` und `afterprint` ([WebKit-Fehler 327504](https://bugs.webkit.org/show_bug.cgi?id=327504), offen seit 13.10.2026; die Versionshinweise zu iOS 27.1 bis 27.3 nennen keine Korrektur). Ein Tab in Safari druckt weiter, ebenso die Browser am Computer. Randen rief `window.print()` an 13 Stellen in 11 Dateien auf.
- **Sichern:** Eine Datei über einen Link mit `download` und einer Blob-Adresse zu sichern, geht in der installierten App auf dem iPhone schief: iOS zeigt eine Vorschau statt eines Downloads, früher ohne Weg zurück. So sicherte Randen die Sicherung (`features/settings`) und den Export der Speisekarte (`features/menu`).
- **Was dort geht:** das Teilen-Menü mit einer Datei, `navigator.share({ files: [file] })`. Es bietet «Drucken» und «In Dateien sichern».
- **Regeln des Teilen-Menüs:**
  - Es öffnet sich nur direkt im Tipp (vorübergehende Nutzeraktivierung). Die Datei muss also vor dem Tipp fertig sein; nach einem `await` ist die Aktivierung oft verbraucht.
  - Dateien ohne Text teilen; manche Ziele behalten sonst nur den Text.
  - Zuerst `navigator.canShare({ files })` fragen. Firefox am Computer kennt kein Teilen.
  - `AbortError` heisst: Die Person hat das Menü geschlossen. Das ist ein gewöhnlicher Abbruch.
- **Die installierte App erkennen:** auf einem iPhone oder iPad `navigator.standalone === true` oder der Anzeigemodus `standalone` oder `fullscreen`. Das Gerät zählt immer: Eine Web-App im Dock des Mac meldet `navigator.standalone` auch und druckt mit dem Druckdialog. In einer installierten iOS-App kann `standalone` falsch und `fullscreen` wahr sein ([WebKit-Fehler 264218](https://bugs.webkit.org/show_bug.cgi?id=264218)). Der Anzeigemodus allein genügt nie: Android und Computer melden ihn auch, und dort geht das Drucken.
- **Rettich macht das schon:** Teilen mit Download als Rückfall (`share-file.ts`), PDF auf dem Gerät mit jsPDF (Rettich ADR-0030, `pdf-kit.ts`). Randen übernimmt das (CLAUDE.md, Arbeitsweise 7).

## Entscheid

1. **Teilen statt Download in der installierten iOS-App** (`apps/web/src/ui/share-file.ts`).
   - `shareOrDownload(file, { title })` gibt `shared`, `cancelled`, `downloaded` oder `failed` zurück.
   - `AbortError` ergibt `cancelled`; sonst geschieht nichts.
   - Ein anderer Fehler (etwa `NotAllowedError`, wenn der Tipp zu lange her ist) führt zum Download, wie bei Rettich. Ein Knopf, der still nichts tut, wäre schlechter. `failed` heisst: Auch der Download liess sich nicht starten; die Seite sagt dann, was zu tun ist.
   - `isInstalledIos()` und `canShareFiles(file)` wie im Kontext beschrieben. Ausserhalb der installierten iOS-App bleibt der Download wie bisher (`downloadFile`).
   - In der installierten iOS-App öffnet ein Download nur eine Vorschau. Dort zählt nur `shared` als weitergegeben, im Browser auch `downloaded` (`fileHandedOver`).
2. **Die Sicherung** liest den ganzen Betrieb mit seinen Fotos und entsteht darum nur auf Wunsch.
   - Im Browser lädt ein Tipp sie wie bisher herunter.
   - In der installierten iOS-App erstellt der erste Tipp «Sicherung erstellen» die Datei, mit Passwort verschlüsselt, wenn gewünscht. Ein zweiter Tipp «Sicherung teilen» gibt die fertige Datei ins Teilen-Menü. Nach dem Lesen und Verschlüsseln wäre die Aktivierung des ersten Tipps verbraucht.
   - Der Tag der Sicherung wird erst gemerkt, wenn die Datei geteilt ist, im Browser auch, wenn sie heruntergeladen ist. Öffnet sie sich in der installierten iOS-App nur als Vorschau, sagt die Seite, wie sie in Dateien kommt (Teilen-Symbol, «In Dateien sichern»), und merkt sich den Tag nicht. Solange die Datei entsteht, sind Schalter und Passwort gesperrt.
3. **Der Export der Speisekarte** geht in der installierten iOS-App wie die Sicherung in zwei Tipps: «Datei vorbereiten» liest die Karte mit ihren Fotos einmal, «Datei teilen» gibt diese Datei ins Teilen-Menü. Geht das Vorbereiten schief, sagt die Seite es und bietet «Noch einmal»; kein Knopf dreht ohne Ende.
4. **Drucken über ein PDF in der installierten iOS-App** (`apps/web/src/ui/print.ts`, `usePrintAction`; `apps/web/src/ui/PrintButton.tsx`).
   - Im Browser ruft der Tipp `window.print()` direkt auf, wie bisher.
   - In der installierten iOS-App baut die Seite ihr PDF, sobald ihre Daten da sind, und hält die Datei bereit. Der Knopf dreht, bis sie fertig ist; der Tipp teilt sie.
   - Geht Teilen nicht, wird das PDF heruntergeladen. Geht auch das nicht, sagt ein ruhiger Hinweis, was zu tun ist. Lässt sich das PDF gar nicht erstellen, sagt das ein eigener Hinweis, und «Noch einmal» erstellt es neu.
   - Eine Seite ohne PDF zeigt in der installierten iOS-App nach dem Tipp einen Hinweis: Das PDF folgt, und bis dahin hilft ein Bildschirmfoto. Einen Knopf, der nichts tut, gibt es nicht. Safari ist kein Ausweg, weil Safari einen eigenen Speicher hat und die Daten der App nicht sieht.
   - Alle 13 früheren Aufrufe von `window.print()` laufen über diesen einen Weg: `PrintButton`, oder `usePrintAction` direkt, wo eine Seite ihren eigenen Knopf hat (Gästeansicht) oder auf Adresse druckt (Etikett der Produktion). Eine Seite bekommt ihr PDF, indem sie `pdf={{ buildPdf, fileName }}` übergibt; sonst ändert sich nichts.
   - Eine Adresse, die drucken will (`?drucken=1`, `?print=1`), öffnet im Browser den Druckdialog. In der installierten iOS-App zeigt sie einen Hinweis mit dem Knopf, weil das Teilen-Menü einen Tipp braucht, oder den Hinweis, dass das PDF folgt.
5. **Das PDF entsteht auf dem Gerät mit jsPDF** (MIT, gepflegt). Es wird dynamisch geladen, erst wenn ein PDF entsteht.
   - Ein kleines Kit `apps/web/src/ui/pdf/`, übernommen aus Rettichs `pdf-kit.ts`, in Randens Farben: A4 hoch, feste Ränder, ein Titelblock, Text, der umbricht, Pillen, eine Tabelle, deren Kopfzeile sich auf jeder neuen Seite wiederholt, Säulen und Balken, eine Fusszeile mit Seitenzahl und Druckdatum (Zürcher Kalendertag). Geld kommt formatiert aus dem Geldformatierer der App (CHF mit zwei Nachkommastellen).
   - Die Standardschrift Helvetica deckt Umlaute, «», – und … ab. Was sie nicht kennt, ersetzt `pdfText`: schmale Leerzeichen durch Leerzeichen, einen Buchstaben durch seinen Grundbuchstaben (Ćevapčići wird Cevapcici, die Ligatur ﬂ wird fl); was dann noch fehlt (Emoji, Symbole), entfällt.
   - PDFs bleiben hell, auch im Dunkelmodus: Sie sind für Papier (Rettich ADR-0081).
6. **Die optionalen Teile von jsPDF fallen weg.** html2canvas, canvg (mit core-js) und DOMPurify zeigen in `apps/web/vite.config.ts` (`resolve.alias`) auf ein leeres Modul (`ui/pdf/unused-part.ts`). Sie kommen weder ins Bundle noch in den Vorab-Cache (Rettich TD-15). Randen zeichnet kein HTML und kein SVG in ein PDF.
7. **Das erste PDF ist die Speisekarte für Gäste** (`features/menu/guest-pdf.ts`).
   - Es liest dieselbe Abfrage `menu.guest` und denselben Filter wie die Seite, damit Seite und PDF immer übereinstimmen.
   - Es enthält, was die gedruckte Karte enthält: Betrieb und Name der Karte, Einleitung, Abschnitte, jedes Gericht mit Name, Beschreibung, Preis (wenn die Karte Preise zeigt), Allergenen und Spuren, Ernährung und Merkmalen, Herkunft, dem Hinweis «Angaben unvollständig», dazu den Schluss der Karte und den festen Satz zu den Allergenen.
   - Am Ende stehen die Allergene der Karte mit ihrer Bezeichnung nach LIV Anhang 6, weil sich auf Papier kein Gericht öffnen lässt.
   - Fotos lässt das PDF weg, wie der Druck der Seite.

## Folgen

- jsPDF ist ein eigener Teil von 399 kB (129 kB gzip). Er liegt im Vorab-Cache, damit das PDF offline entsteht, und wird erst beim ersten PDF geladen. Ohne die Aliase kämen rund 380 kB dazu (html2canvas 199 kB, canvg mit core-js 151 kB, DOMPurify 29 kB); gemessen am 17.11.2026: Vorab-Cache 152 Einträge mit 2093 KiB statt 154 mit 2464 KiB.
- Seite und PDF lesen dieselben Daten; das PDF speichert nichts und ist keine zweite Wahrheit (ADR-0008).
- Zehn Seiten drucken in der installierten iOS-App noch nicht, sondern sagen es (TD-56). Ihre PDFs folgen mit dem Kit.
- Was nur ein echtes iPhone oder iPad bestätigt, steht in TD-40.
- ADR-0002 sah «keine PDF-Bibliothek» vor. Das gilt weiter für den Browser, der die Druckansichten mit CSS druckt; für die installierte iOS-App ist jsPDF die Ausnahme.
- Neue Nebenwirkungen: Teilen von Dateien (SE-08), Drucken über PDF (SE-07), Sichern über `ui/share-file.ts` (SE-10).

## Nicht entschieden

- Ob auch der Browser am Computer das PDF statt der Druckansicht bekommt, damit jedes Gerät dasselbe Papier druckt.
- Ob die installierte iOS-App wieder den Druckdialog nutzt, sobald WebKit den Fehler 327504 behebt. Bis dahin bleibt der Weg über das PDF.
