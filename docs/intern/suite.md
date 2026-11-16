# Suite der Firma: die lange Fassung

Für Alban. Die kurze Fassung mit den offenen Fragen ist [ADR-0020](../adr/0020-suite-der-firma.md). Stand 16.11.2026. Die Firma hat noch keinen Namen; hier steht «die Firma», in Mustern `<Firma>`.

Adressen stehen hier nur als Muster: `<konto>` ist der Name des Cloudflare-Kontos, `<domain>` die Domain der Firma, die es noch nicht gibt.

## 1. Was «Suite» heute heisst

- Getrennte, installierbare Apps unter einem ruhigen Absender, mit gemeinsamen Regeln für Gestaltung und Sprache.
- **Nicht:** ein gemeinsames Code-Paket, gemeinsame Daten, eine gemeinsame App.
- Das Wort «Suite» steht nie in einer App. Wo die Apps einander nennen, heisst es «Apps der Firma».

## 2. Marke

### Die Produkte führen

| Wo | Was steht dort |
| --- | --- |
| Kopf der App, Home-Bildschirm, Dock, Titel im Browser | nur das Produkt: «Randen», «Rettich» |
| «Über Randen» (bei Rettich heute keine eigene Seite; der Eintrag gehörte unter «Mehr») | «Randen · von `<Firma>`» und, später, «Apps der Firma» |
| Startseite der Firma | der Absender oben, darunter die Produkte |
| Rechtliche Texte (Impressum, Datenschutz, Bedingungen) | die Firma als Herausgeberin |

Die Firma spricht nur dort, wo jemand nach ihr fragt. Sie steht nie über einem Produkt, nie in einer Tab-Leiste oder Seitenleiste und nie in einer Meldung.

### Namensmuster (Empfehlung)

- Ein Schweizer Gartengemüse, ein Wort.
- Im Text mit grossem Anfangsbuchstaben (Rettich, Randen), technisch klein (`randen`, `@randen/*`; bei Rettich bleibt technisch `fridgeai`, Rettich-ADR-0032).
- Eine Leitfarbe pro Produkt: Rettich Smaragd `#135E42`, Randen Rotwein `#6D1F2F`. Die Leitfarbe heisst in jeder App «was du tippst und was gewählt ist».
- Das App-Symbol ist das Gemüse auf der Leitfarbe, im Raster 512 × 512 mit Eckenradius 112.

### Was alle Apps teilen

Die geprüften Werte stehen in [`../design.md`](../design.md), Abschnitt «Gemeinsam mit Rettich»: Schrift `#14161A` (in Rettich «Tinte», in Randen `ink`), Systemschrift in `rem`, Ziele 44 px, Radien 12, 16, 24 und Pille, 4-px-Raster, Lucide mit Strich 1.75, Bewegung 150 bis 200 ms, keine Emojis, eine Bedeutung pro Farbe, Dunkelmodus nach Gerät, Breiten 768 und 1024 px, Seitenleiste 256 px. Wo die beiden Apps heute abweichen (Radius 10 px für Segmente bei Rettich, Felder mindestens 16 px nur in Randen, die schmale Leiste von Randen ab 768 px, die Inhaltsbreiten), steht es dort pro App.

Die Sprache folgt [`../regeln.md`](../regeln.md), Abschnitt A, für alle Apps der Firma: Deutsch (Schweiz), «du», ruhig, keine Schlagworte, keine Ausrufezeichen.

## 3. Wege zwischen den Produkten

**Heute:** nur über den Home-Bildschirm (iPhone, iPad) oder das Dock und das Startmenü (Mac, Windows). Jede App ist für sich installiert.

**Später:** ein ruhiger Eintrag «Apps der Firma» unter «Über …», der zur Startseite der Firma führt. Von dort öffnet die Person das andere Produkt und installiert es.

**Nie direkt in die andere App,** aus drei Gründen:

1. Auf iOS öffnet ein Link aus einer installierten Web-App Safari. Safari hat einen anderen Speicher als die installierte App; die andere App sähe dort leer aus, obwohl sie auf dem Home-Bildschirm voll ist.
2. Wer dann in Safari weiterarbeitet, legt Daten am falschen Ort an. Nach der Regel von WebKit löscht Safari den Speicher einer Website, die an sieben Tagen mit Safari nicht besucht wurde; installierte Web-Apps auf dem Home-Bildschirm sind davon ausgenommen.
3. Die Startseite erklärt die Installation; ein direkter Link kann das nicht.

## 4. Adressplan

### Muster

| Stand | Startseite der Firma | Rettich | Randen | Konten |
| --- | --- | --- | --- | --- |
| Heute | keine | `fridgeai.<konto>.workers.dev` | `randen.<konto>.workers.dev` | keine |
| Mit Domain | `<domain>` | `rettich.<domain>` | `randen.<domain>` | später `konto.<domain>` |

Vorschauen der Branches laufen unter eigenen Adressen (`<branch>-randen.<konto>.workers.dev`, bei Rettich `<branch>-fridgeai.<konto>.workers.dev`). Jede ist eine eigene Herkunft mit eigenem Speicher; dort liegen nie echte Betriebsdaten.

### Eine Herkunft pro Produkt

Die Herkunft (Origin) ist Schema, Host und Port einer Adresse. An ihr hängen:

- der Speicher (IndexedDB, Local Storage, Cache) und seine Quote;
- der Service Worker und damit das Arbeiten ohne Netz;
- die CSP und die übrigen Kopfzeilen der Antwort;
- die Identität der installierten App: Symbol, Name, Fenster;
- «Websitedaten löschen» im Browser und `Clear-Site-Data`.

Zwei Produkte unter Pfaden einer Adresse (`<domain>/rettich`, `<domain>/randen`) teilten das alles. Löschte jemand die Daten von Rettich, wäre auch die Küche weg. Darum: nie zwei Produkte unter einer Herkunft.

### Warum Unteradressen einer Domain

Unteradressen (`rettich.<domain>`, `randen.<domain>`) sind getrennte Herkünfte. Ein Passkey, der später für `<domain>` angelegt wird, gilt trotzdem auf allen Unteradressen. So bleibt der Weg zu einem Konto der Firma offen, ohne dass die Daten der Produkte zusammenfallen.

### Nie umbenennen

Die Cloudflare-Projekte `fridgeai` und `randen` und der Name des Kontos bilden die heutige Adresse. Wer einen davon umbenennt, verschiebt die Herkunft: Die App unter der neuen Adresse ist für den Browser eine andere App, ihr Speicher ist leer, und die Daten bleiben auf jedem Gerät an der alten Adresse liegen. Darum bleiben die Namen, wie sie sind ([`../previews.md`](../previews.md)).

### Wann die Adresse von Randen feststehen muss

Vor dem ersten Pilotbetrieb. Bis dahin ist `randen.<konto>.workers.dev` eine Demo. Danach ist die Adresse die App dieser Küche auf ihrem Tablet, mit Lager, Rezepten und den Aufzeichnungen der Selbstkontrolle. Ein späterer Wechsel hiesse: jede Küche zieht mit ihrer Sicherung um.

## 5. Umzugsregel

Muss eine App doch an eine neue Adresse (etwa Rettich von `fridgeai.<konto>.workers.dev` auf `rettich.<domain>`), gilt für jedes Gerät:

1. **Zuerst sichern** an der alten Adresse: Randen «Mehr › Daten und Sicherung», Rettich «Mehr › Deine Daten». Die Datei liegt danach bei der Person, nicht auf einem Server.
2. Die neue Adresse öffnen und installieren (Home-Bildschirm, Dock).
3. **Zurückholen** an der neuen Adresse und prüfen, dass alles da ist: bei Randen auch der Bericht der Selbstkontrolle.
4. Erst dann die alte App vom Home-Bildschirm entfernen und ihre Daten löschen.

Das ist die Lektion aus Rettich L-11: iOS fixiert Symbol und Speicher einer Web-App beim Hinzufügen zum Home-Bildschirm; eine neue Adresse oder ein neues Symbol heisst vorher exportieren, danach importieren. Eine Weiterleitung von der alten auf die neue Adresse nimmt keine Daten mit.

## 6. Desktop

- **Heute und ohne Kosten:** dieselbe PWA, aus dem Browser installiert. Ab 1024 px zeigt Randen die Seitenleiste (ADR-0013), Rettich ebenso (Rettich-ADR-0092).
- **So installierst du:**
  - iPhone und iPad: in Safari «Teilen › Zum Home-Bildschirm»;
  - Mac mit Safari: «Ablage › Zum Dock hinzufügen»;
  - Android mit Chrome: Chrome-Menü › «App installieren».
  - Windows und Mac mit Chrome oder Edge: «Installieren» in der Adresszeile.
- **Keine bezahlten Hüllen jetzt.** App Store, Google Play und signierte Programme ausserhalb eines Stores kosten Geld, der Microsoft Store laut Microsoft keine Registrierungsgebühr. Jeder Store ist Albans Entscheid ([ADR-0020](../adr/0020-suite-der-firma.md), Frage 5).

| Weg | Kosten | Quelle (recherchiert am 16.11.2026) |
| --- | --- | --- |
| Apple Developer Program (App Store) | 99 USD pro Jahr | [developer.apple.com](https://developer.apple.com/programs/whats-included/) |
| Google Play | 25 USD einmalig | [support.google.com](https://support.google.com/googleplay/android-developer/answer/6112435) |
| Microsoft Store | Registrierung kostenlos (Seite von Microsoft vom 29.10.2026) | [learn.microsoft.com](https://learn.microsoft.com/en-us/windows/apps/publish/partner-center/account-types-locations-and-fees) |
| Code-Signierung für Windows (Trusted Signing), nur ausserhalb eines Stores | nicht belegt: die Preisseite zeigte keinen Betrag; vor einem Entscheid nachsehen | [azure.microsoft.com](https://azure.microsoft.com/en-us/pricing/details/trusted-signing/) |

Am 16.11.2026 geprüft: Apple nennt 99 USD pro Mitgliedsjahr, Google 25 USD einmalig. Die Seite von Microsoft leitet auf «Steps to open a Microsoft Store developer account» (Stand 29.10.2026) weiter und nennt dort keine Registrierungsgebühr für Einzelpersonen und Firmen, wenn das Konto über die Seite für Store-Entwickler eröffnet wird; ein Firmenkonto verlangt eine eingetragene Firma. Die Preisseite für die Signierung lädt ihre Beträge erst im Browser; der Betrag von rund 9.99 USD ist dort nicht maschinell lesbar und bei einem Entscheid nachzusehen.

## 7. Gemeinsamer Code

- **Heute:** kopieren, mit Vermerk der Herkunft. Den gemessenen Stand der fünf Kerndateien (`ids.ts`, `format.ts`, `money.ts`, `currency.ts`, `dates.ts`) hält [`../rettich.md`](../rettich.md) fest, Abschnitt «Gemeinsamer Kern (Kopie)».
- **Später:** ein gemeinsames Kern-Paket, wenn es einen Namen der Firma und einen Server gibt.
- **Nie:** Code, Namen oder Strategie von Randen im öffentlichen Rettich-Repo (CLAUDE.md, Arbeitsweise 5 und 7).

## 8. Startseite der Firma (Entwurf)

[`suite/startseite.html`](suite/startseite.html) mit [`suite/startseite.css`](suite/startseite.css):

- statisches HTML und CSS, kein Skript, kein Manifest, kein Speicher, keine Cookies;
- CSP `default-src 'self'` und `script-src 'none'` (im Entwurf als `meta`; ausgeliefert gehört sie in die Kopfzeilen), `noindex`, nicht installierbar;
- Inhalt: der Absender, ein Satz, eine Karte pro Produkt mit Symbol, für wen, «Öffnen» und «So installierst du», dazu «Kein Konto. Jede App hält ihre Daten getrennt auf deinem Gerät.»;
- «Firma» und `<domain>` sind Platzhalter. Die Links «Öffnen» zeigen auf `https://rettich.<domain>/` und `https://randen.<domain>/` und führen darum heute nirgends hin.

Das Symbol von Rettich liegt als Kopie daneben (`suite/rettich.svg`, aus `apps/web/public/icon.svg` von Rettich); das von Randen wird aus `apps/web/public/icon.svg` dieses Repos gelesen.

Anschauen: im Repo `python3 -m http.server` starten und `/docs/intern/suite/startseite.html` öffnen. Die Startseite wird nicht ausgeliefert und steht nicht in `wrangler.jsonc`, bis Alban Randen zeigen will (ADR-0020, Frage 4).

## 9. Risiken

| Risiko | Folge | Was dagegen hilft |
| --- | --- | --- |
| Ein Projekt oder das Konto wird umbenannt | Neue Herkunft; die Daten bleiben auf jedem Gerät an der alten Adresse | Namen nie ändern ([`../previews.md`](../previews.md)) |
| Randen startet den Pilot auf einer Adresse, die später wechselt | Jede Küche zieht mit Sicherung um, samt Selbstkontrolle | Adresse vor dem ersten Pilotbetrieb festlegen |
| Ein Umzug ohne Sicherung | Daten verloren | Umzugsregel (Abschnitt 5); beide Apps erinnern schon heute an die Sicherung (Randen nach 14 Tagen, Rettich nach 30) |
| Ein Link führt direkt in die andere App | Auf iOS öffnet Safari mit leerem Speicher; die Person glaubt, ihre Daten seien weg | Nur zur Startseite verlinken |
| Zwei Produkte unter einer Adresse | Gemeinsamer Speicher, ein Löschen trifft beide | Eine Herkunft pro Produkt |
| Die Kopien des Kerns laufen auseinander | Geld oder Datum rechnen in den Apps verschieden | Stand in [`../rettich.md`](../rettich.md) messen; Änderung in beiden Repos nachziehen |
| Die Startseite zeigt Randen zu früh | Randen wird gesehen, bevor Alban es will | Entwurf bleibt in `docs/intern/` und wird nicht ausgeliefert |
| Etwas von Randen landet im Rettich-Repo | Steht öffentlich | Von Randen fliesst nichts zurück |
| Name der Firma und Domain passen nicht zusammen | Die Adresse hängt an einer Domain, die man später nicht mehr wechselt | Domain erst mit dem Namen kaufen |

## 10. Entscheide für Alban

Die Fragen mit Optionen und Empfehlung stehen in [ADR-0020](../adr/0020-suite-der-firma.md), Abschnitt «Offene Entscheide»:

1. Name der Firma.
2. Namensmuster für weitere Produkte.
3. Adressen der Suite, mit der Frist für Randen vor dem ersten Pilotbetrieb.
4. Startseite der Firma sichtbar.
5. Desktop und Stores (Kosten oben in Abschnitt 6).
6. Konten, Sync und Lizenzen.

Preise, Pakete und Vergleiche mit anderen Produkten stehen nicht hier, sondern in `rettich-intern/ideen/gastro.md`.
