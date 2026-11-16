# ADR-0020: Suite der Firma: getrennte Apps, eine Herkunft pro Produkt, ein ruhiger Absender

- **Status:** Entwurf, zur Bestätigung durch Alban
- **Datum:** 2026-11-16
- **Entscheid von:** Claude (Vorschlag)
- **Betrifft:** ADR-0006 (Betriebsdaten bleiben auf dem Gerät), ADR-0013 (iPhone, iPad und Web), ADR-0015 (Betriebsarten und Funktionen)
- **Ausführlich:** [`../intern/suite.md`](../intern/suite.md); Entwurf der Startseite in [`../intern/suite/`](../intern/suite/)

## Kontext

Alban wünscht Randen als App und als Desktop-Version, wie eine Suite, mit Rettich als Teil davon, und zwar schon jetzt vorbereitet, obwohl kein Server läuft.

Heute gilt:

- Rettich (Haushalte) und Randen (Küchen) sind zwei PWAs in zwei Repos. Rettich ist öffentlich, Randen privat. Beide liefern nur statische Dateien aus, je unter einer eigenen Adresse nach dem Muster `<app>.<konto>.workers.dev` (Cloudflare-Projekte `fridgeai` und `randen`).
- Beide halten alle Daten im Browser des Geräts, ohne Konto (ADR-0006). Speicher, Service Worker, CSP, die Identität der installierten App und «Websitedaten löschen» hängen an der **Herkunft (Origin)** einer Adresse: Schema, Host und Port.
- Rettich läuft im Pilot auf seiner Adresse. Lektion aus Rettich L-11: iOS fixiert Symbol und Speicher einer Web-App beim Hinzufügen zum Home-Bildschirm; eine neue Adresse heisst vorher sichern, danach zurückholen.
- Die Firma hinter beiden Produkten hat noch keinen Namen; Vorschläge mit einer ersten Prüfung stehen in [`../intern/firmenname.md`](../intern/firmenname.md). Hier steht dafür «die Firma».

Zwei unabhängige Vorschläge kamen zum selben Ergebnis. Dieser Entwurf hält es fest und erfindet nichts dazu.

## Entscheid (Vorschlag)

1. **Suite heisst heute:** getrennte, installierbare Apps unter einem ruhigen Absender, mit gemeinsamen Regeln für Gestaltung und Sprache. Kein gemeinsames Code-Paket, keine gemeinsamen Daten, keine gemeinsame App. Das Wort «Suite» steht nie in der App; wo nötig, heisst es «Apps der Firma».
2. **Die Produkte führen, die Firma ist Absender.** «Randen · von `<Firma>`» steht nur unter «Über …», auf der Startseite der Firma und in rechtlichen Texten, nie im Kopf einer App. Jedes Produkt hat eine Leitfarbe (Rettich Smaragd, Randen Rotwein). Gemeinsame Werte stehen in [`design.md`](../design.md), Abschnitt «Gemeinsam mit Rettich», die Regeln für Texte in [`regeln.md`](../regeln.md).
3. **Eine Herkunft pro Produkt.** Jedes Produkt hat seine eigene Adresse, nie zwei Produkte unter Pfaden derselben Adresse. Heute `fridgeai.<konto>.workers.dev` und `randen.<konto>.workers.dev`. Später, mit einer Domain der Firma: die Startseite auf `<domain>`, die Produkte auf Unteradressen (`rettich.<domain>`, `randen.<domain>`, später `konto.<domain>`), damit ein Passkey der Firma später für alle gelten kann.
4. **Nie umbenennen:** Die Cloudflare-Projekte `fridgeai` und `randen` und der Name des Kontos bleiben, wie sie sind. Ein neuer Name verschiebt die Herkunft, und die Daten blieben auf jedem Gerät an der alten Adresse liegen.
5. **Die endgültige Adresse von Randen steht vor dem ersten Pilotbetrieb fest.** Danach müsste jede Küche mit ihrer Sicherung umziehen, samt den Aufzeichnungen der Selbstkontrolle.
6. **Von einem Produkt zum andern** geht es heute nur über den Home-Bildschirm oder das Dock. Später führt ein ruhiger Eintrag «Apps der Firma» unter «Über …» zur Startseite der Firma, nie direkt in die andere App: Auf iOS öffnet ein Link aus einer installierten Web-App Safari, und dessen Speicher ist getrennt; die andere App sähe leer aus.
7. **Startseite der Firma:** statisches HTML und CSS, ohne Skript, Manifest, Speicher und Cookies, CSP nur `'self'`, `noindex`, nicht installierbar. Inhalt: Absender, ein Satz, eine Karte pro Produkt (Symbol, für wen, «Öffnen», «So installierst du» pro Plattform) und «Kein Konto. Jede App hält ihre Daten getrennt auf deinem Gerät.» Sie bleibt ein privater Entwurf in `docs/intern/suite/`, bis Alban Randen zeigen will. Sie wird nicht ausgeliefert und steht nicht in `wrangler.jsonc`.
8. **Desktop** ist dieselbe PWA, aus dem Browser installiert, mit dem Rahmen ab 1024 px (ADR-0013). Keine bezahlten Hüllen. App Store und Google Play kosten Geld, ein signiertes Programm ausserhalb eines Stores ebenso; der Microsoft Store verlangt laut Microsoft keine Registrierungsgebühr. Jeder Store bleibt ein Entscheid von Alban (Frage 5; Beträge mit Quellen in [`../intern/suite.md`](../intern/suite.md)).
9. **Gemeinsamer Code wird kopiert**, mit Vermerk der Herkunft ([`rettich.md`](../rettich.md), Abschnitt «Gemeinsamer Kern (Kopie)»). Ein gemeinsames Kern-Paket wartet auf den Namen der Firma und einen Server. Von Randen fliesst nichts zurück ins öffentliche Rettich-Repo (CLAUDE.md, Arbeitsweise 5 und 7).
10. **Später, je ein Entscheid von Alban:** eine Domain (kostet), Konten mit Passkeys (braucht einen Server; Daten verlassen das Gerät), Sync pro Produkt mit getrennten Daten, Stores. Wie die Firma mit den Produkten Geld verdient, steht nicht hier, sondern in `docs/intern/` und in `rettich-intern` (CLAUDE.md, Arbeitsweise 5).

## Begründung

- **Getrennte Herkunft schützt die Daten.** Zwei Produkte unter einer Adresse teilten Speicher und Speicherquote, ein «Websitedaten löschen» träfe beide, die Service Worker kämen sich in die Quere, und eine CSP müsste für beide passen.
- **Unteradressen einer Domain** halten die Herkunft getrennt und lassen trotzdem einen gemeinsamen Passkey zu: Ein Passkey, der für die Domain angelegt ist, gilt auch auf ihren Unteradressen.
- **Die Produkte führen,** weil jedes sein eigenes Publikum hat: der Haushalt und die Küche. Ein Firmenname im Kopf der App wäre ein Wort mehr ohne Nutzen.
- **Kopieren statt teilen,** weil ein Repo öffentlich und eines privat ist. Ein gemeinsames Paket bräuchte ein drittes Repo oder eine Veröffentlichung, und nichts von Randen darf zurück zu Rettich.

## Folgen

- Dieser Schritt ändert weder App noch Code.
- Rettich bleibt auf `fridgeai.<konto>.workers.dev`, bis Alban anders entscheidet. Ein Umzug auf `rettich.<domain>` heisst für jede Person im Pilot: sichern, die neue Adresse öffnen und installieren, zurückholen.
- Neue Werte, die beide Apps teilen sollen, kommen zuerst in [`design.md`](../design.md) und [`regeln.md`](../regeln.md); was abweicht, steht dort pro App.
- Die fünf kopierten Kerndateien hält niemand automatisch gleich. [`rettich.md`](../rettich.md) hält den gemessenen Stand fest.
- Neue Begriffe im [Glossar](../glossar.md): Firma, Startseite der Firma, Herkunft (Origin). Vier neue offene Entscheide im [Plan](../plan.md).

## Offene Entscheide

1. **Name der Firma.** (a) Ein Name aus der laufenden Suche. (b) Eines der Produkte gibt der Firma den Namen. **Empfehlung:** (a). Die Firma ist Absender; trüge sie den Namen eines Produkts, wäre dieses Produkt der Absender des andern.
2. **Namensmuster für weitere Produkte.** (a) Ein Schweizer Gartengemüse, ein Wort, im Text mit grossem Anfangsbuchstaben, technisch klein, eine Leitfarbe pro Produkt. (b) Freie Wahl pro Produkt. **Empfehlung:** (a), wie Rettich und Randen.
3. **Adressen der Suite.** (a) Alles bleibt auf `<app>.<konto>.workers.dev`. (b) Eine Domain der Firma: die Startseite auf `<domain>`, die Produkte auf `rettich.<domain>` und `randen.<domain>`. **Empfehlung:** (b), sobald der Name feststeht, weil die Domain Geld kostet und am Namen hängt. Randen bekommt seine endgültige Adresse vor dem ersten Pilotbetrieb: Gibt es bis dahin die Domain, startet Randen auf `randen.<domain>`; sonst bleibt `randen.<konto>.workers.dev` die Adresse dieser Küchen. Rettich zieht nur um, wenn Alban es will, und dann mit Sicherung.
4. **Startseite der Firma sichtbar.** (a) Sie bleibt ein privater Entwurf. (b) Sie wird mit der Domain ausgeliefert. **Empfehlung:** (a), bis Alban Randen zeigen will; dann (b), auf `<domain>` und nie unter einer Adresse eines Produkts.
5. **Desktop und Stores.** (a) Nur die PWA aus dem Browser, kostenlos. (b) Der Microsoft Store: Registrierung laut Microsoft kostenlos (Seite vom 29.10.2026), der Store signiert die Pakete selbst. (c) App Store und Google Play: kosten Geld (Apple 99 USD pro Jahr, Google 25 USD einmalig). **Empfehlung:** (a) jetzt. Über (b) und (c) erst mit dem Namen der Firma entscheiden, weil jeder Store einen Herausgeber verlangt; (b) kostet keine Gebühr, aber Arbeit für Paket und Prüfung.
6. **Konten und Sync.** (a) Bleiben weg, wie heute. (b) Konten mit Passkeys auf `konto.<domain>`, Sync pro Produkt mit getrennten Daten. **Empfehlung:** (a), bis Alban einen Server will; (b) braucht vorher die Domain und einen Entscheid nach ADR-0006, weil dabei Daten das Gerät verlassen.
