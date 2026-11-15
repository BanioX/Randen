# ADR-0015: Betriebsarten und Funktionen

- **Status:** angenommen
- **Datum:** 2026-11-15
- **Entscheid von:** Claude, nach Albans Auftrag (15.11.2026): «Es gibt auch kleine Restaurantbetriebe, die beim Cash & Carry einkaufen. Also braucht es unterschiedliche Versionen: Du wählst je nach Betrieb die Komplexität aus. Für jede Art von Gastro geeignet: Bistro, Restaurant, Mittagstisch, Grossküche, Mensa, Kantine usw. Durchziehen und durchdenken. Modular.»
- **Geprüft:** Der Entwurf wurde aus zwei Blickwinkeln geprüft, als Imbiss oder kleines Bistro, das im Cash & Carry einkauft, und als Gemeinschaftsgastronomie (Kantine, Mensa, Heim, Produktionsküche). Was daraus übernommen wurde, steht unter «Aus der Prüfung».
- **Ersetzt teilweise:** [ADR-0014](0014-essentials-and-extras.md). Was es «Gruppen» nennt, sind jetzt Funktionen des Betriebs. Der Schalter «Erweitert» bleibt als Ansicht pro Gerät, er blendet aber keine Funktionen mehr aus, nur die Tiefe.

## Kontext

Ein Imbiss und eine Produktionsküche haben dasselbe Ziel: wissen, was da ist, nichts wegwerfen und die Zahlen kennen. Ihr Alltag ist aber ein anderer:

- **Der Imbiss** kauft selbst im Cash & Carry ein, zahlt an der Kasse und kocht ein Dutzend Dinge. Für Formulare hat er keine Zeit.
- **Das Restaurant** bestellt bei Lieferanten. Es hat eine Karte, eine Brigade und Mise en place.
- **Das Tagesrestaurant** kocht jeden Tag ein bis drei Menüs für viele Gäste in kurzer Zeit und plant die Woche.
- **Kantine, Mensa, Spital und Heim** planen Menülinien Wochen voraus. Sie zählen Mahlzeiten, rechnen pro Mahlzeit ab und berichten der Auftraggeberin.
- **Die Produktionsküche** kocht in Chargen für Aussenstellen (Cook & Chill). Sie braucht Etiketten, Lieferscheine und die Rückverfolgung. Eine Speisekarte hat sie nicht.
- **Kita, Schule und Mittagstisch** bekommen das Essen oft geliefert. Sie zählen die Mahlzeiten und brauchen die Allergene jedes Tages.

Eine App mit allem für alle überfordert den Imbiss. Eine App nur für den Imbiss reicht der Produktionsküche nicht.

## Entscheid

### Drei Ebenen

| Ebene | Was | Gilt für | Wer wählt |
| --- | --- | --- | --- |
| **Betriebsart** | Was für ein Betrieb das ist | den Betrieb (in der Sicherung) | beim Einrichten, später unter «Betrieb › Funktionen» |
| **Funktionen** | Womit der Betrieb arbeitet | den Betrieb (in der Sicherung) | Die Antworten beim Einrichten schlagen sie vor. Jede Funktion lässt sich einzeln schalten. |
| **Ansicht** | Wie ausführlich dieses Gerät die Funktionen zeigt: «Erweitert» mit Auswertungen, Verlauf und Journal, sonst das Wichtigste | dieses Gerät | Das Einrichten schlägt den Startwert vor. Danach gilt der Schalter pro Gerät. |

Funktionen entscheiden, **was es gibt**. Die Ansicht entscheidet, **wie tief** ein Gerät es zeigt. Wer «Budget und Zahlen» einschaltet, sieht «Zahlen» in der Navigation, auch ohne «Erweitert». Heute hält ein Gerät die Daten eines Betriebs, denn es gibt keinen Abgleich (ADR-0006). Eine Sicherung, die auf einem zweiten Gerät zurückgelesen wird, ist eine Kopie. Die Ansicht pro Gerät wird erst wichtig, wenn ein Abgleich kommt, zum Beispiel für den Rechner im Büro neben dem Tablet am Pass.

### Funktionen

**Immer dabei** ist der Kern, für jede Küche und nicht abschaltbar: Cockpit, Lager mit Wareneingang, Ablauf, Abschreiber und Inventur, Artikel und Lieferanten, Rezepte mit Wareneinsatz und Allergenen, Selbstkontrolle.

**Schaltbar** (im Code `ModuleId`):

| Funktion | Kennung | Was dazugehört | Braucht |
| --- | --- | --- | --- |
| Speisekarte | `menu_card` | Karten und Wochenmenü für Gäste, Allergenliste für das Personal | |
| Bestellen bei Lieferanten | `ordering` | Bestellvorschlag je Lieferant, Bestellungen, Bestell- und Liefertage | |
| Einkauf im Markt | `market` | Einkaufsliste für den Gang durch den Cash & Carry, Einkauf mit Beleg erfassen | |
| Produktion | `production` | Saucen, Fonds und Komponenten selbst machen, mit Charge, Etikett und Datum | |
| Menüplan | `planning` | Woche mit Menülinien, Bedarf, «Reste verwerten», Allergene je Tag und Linie | |
| Mahlzeiten zählen | `meals` | Erwartete und ausgegebene Mahlzeiten, Wareneinsatz pro Mahlzeit, Tellerrücklauf | |
| Auslieferung | `dispatch` | Empfänger (Aussenstellen, Kund:innen), Bestellungen und Anlässe, Lieferschein, Etikett, Temperatur beim Versand, Rückverfolgung bis zum Empfänger | Produktion |
| Verkäufe | `sales` | Verkaufte Portionen je Gericht, Marge, Menu-Engineering | |
| Budget und Zahlen | `numbers` | Budget, Monatsbericht, Abschreiber nach Grund | |
| Wo ist was? | `places` | Plätze mit Fotos, Rundgang für neue Mitarbeitende | |
| Team | `team` | Mitarbeitende, wer an diesem Gerät arbeitet, «wer» an Buchungen | |

Eine Funktion, die eine andere braucht, schaltet diese mit ein. Wer die Grundlage ausschaltet, schaltet auch ab, was darauf baut (`MODULE_REQUIRES`, `switchModule`).

### Einrichten: drei Fragen schlagen die Funktionen vor

Die Betriebsart allein reicht nicht. Eine Pizzeria zu zweit, die «Restaurant» wählt, braucht kein Team und keinen Rundgang. Darum schlagen drei Antworten die Funktionen vor (`proposeSetup`):

1. **«Was für einen Betrieb führst du?»** Die Betriebsart gibt die Funktionen ihres Fachs vor, zum Beispiel den Menüplan für die Mensa oder die Auslieferung für die Produktionsküche. Die Kacheln zeigen Beispiele, etwa «Kebab, Pizza, Burger, Foodtruck».
2. **«Woher kommt deine Ware?»** Mehrere Antworten sind möglich: «Ich hole sie selbst» (Cash & Carry, Markt, Grosshandel) und «Sie wird mir geliefert». Wer «geliefert» wählt, bekommt die Frage «Bestellst du bei deinen Lieferanten im Voraus?». «Selbst holen» schaltet `market` ein, «im Voraus bestellen» schaltet `ordering` ein. Wird geliefert, ohne dass die Küche bestellt, bleibt der Lieferant für den Wareneingang da, aber es gibt keinen Bestellvorschlag. Das gilt etwa für den Getränkelieferanten, der jeden Dienstag kommt.
3. **«Wie viele Personen arbeiten in deiner Küche?»** Die Antworten sind «Ich allein oder zu zweit», «3 bis 10» und «Mehr als 10». Allein gibt es kein Team und keinen Rundgang. Ab drei Personen kommt das Team dazu. Bei mehr als zehn kommen «Wo ist was?» und die Ansicht «Erweitert» dazu.

Dazu kommen zwei Schritte:

- Für Imbiss, Café und Bäckerei die Frage **«Wo essen deine Gäste meistens?»**. Sie setzt die MWST, die neue Gerichte vorschlagen: 8.1 % hier, 2.6 % zum Mitnehmen ([`docs/fakten.md`](../fakten.md), Abschnitt 3). Beim Gericht lässt sich der Satz ändern.
- Der **Name des Betriebs**.

Am Schluss zeigt **«Das richtet Randen für dich ein»** die vorgeschlagenen Funktionen mit je einem Schalter. Die übrigen liegen zugeklappt unter «Weitere Funktionen». Gespeichert wird erst mit «Fertig» (`business.setup`). Das Einrichten zwingt nicht: Bis dahin bietet das Cockpit es an, und die App zeigt die Grundfunktionen. Der erste Bildschirm bietet «Erst das Demo-Bistro ansehen» an.

### Vorschläge je Betriebsart

✓ heisst, die Betriebsart schlägt die Funktion vor. Markt, Bestellen und Team entscheiden immer die Antworten 2 und 3, ebenso «Wo ist was?» bei «allein» und «mehr als 10». «Ware» nennt die vorgeschlagene Antwort auf Frage 2: **holt** = selbst holen, **bestellt** = geliefert und im Voraus bestellt, **beides** = holt und bestellt, **holt, gebracht** = holt selbst, und was geliefert wird, wird nicht im Voraus bestellt.

| Betriebsart | Kennung | Karte | Produktion | Menüplan | Mahlzeiten | Auslieferung | Verkäufe | Zahlen | Wo ist was? | Ware |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Imbiss und Take-away | `takeaway` | ✓ | | | | | | | | holt |
| Café und Bar | `cafe` | ✓ | | | | | | | | holt, gebracht |
| Bistro und Beiz | `bistro` | ✓ | ✓ | | | | | | | beides |
| Restaurant | `restaurant` | ✓ | ✓ | | | | ✓ | ✓ | ✓ | bestellt |
| Tagesrestaurant | `lunch` | ✓ | ✓ | ✓ | ✓ | | | ✓ | | beides |
| Bäckerei und Konditorei | `bakery` | ✓ | ✓ | | | | ✓ | | | beides |
| Hotel | `hotel` | ✓ | ✓ | ✓ | ✓ | | ✓ | ✓ | ✓ | bestellt |
| Catering und Events | `catering` | ✓ | ✓ | ✓ | | ✓ | | ✓ | ✓ | beides |
| Personalrestaurant und Kantine | `canteen` | ✓ | ✓ | ✓ | ✓ | | ✓ | ✓ | ✓ | bestellt |
| Mensa | `mensa` | ✓ | ✓ | ✓ | ✓ | | ✓ | ✓ | ✓ | bestellt |
| Spital und Heim | `care` | ✓ | ✓ | ✓ | ✓ | | | ✓ | ✓ | bestellt |
| Kita, Schule und Mittagstisch | `school` | | | ✓ | ✓ | | | | | holt, gebracht |
| Produktionsküche | `central_kitchen` | | ✓ | ✓ | | ✓ | | ✓ | ✓ | bestellt |
| Anderer Betrieb | `other` | alle | | | | | | | | beides |

Kleine Betriebe starten bewusst schlank. Die Marge je Gericht steht schon im Rezept (Kern), und «Weggeworfen diesen Monat» gehört ins Cockpit. Zahlen und Verkäufe schaltet ein, wer sie will.

### Vor dem Einrichten

Ein Betrieb aus der Zeit vor diesem Entscheid hat keine Liste von Funktionen (`Business.modules` fehlt). Dann entscheidet die Ansicht des Geräts wie in ADR-0014. «Erweitert» zeigt alles, sonst gelten die Grundfunktionen `STARTER_MODULES` (Speisekarte und Bestellen) (`modulesInUse`). So verliert niemand etwas, und ein neuer Betrieb wird vor dem Einrichten nicht überladen. Im Kern ohne Gerät gilt `hasModule`: ohne Liste ist alles eingeschaltet.

### Einkauf im Markt (Cash & Carry)

- Ein **Lieferant** hat eine Art (`Supplier.kind`): `supplier` liefert und nimmt Bestellungen an, `market` ist der Ort, an dem man selbst holt. Märkte haben keine Bestell- und Liefertage. Die Kundennummer heisst dort «Kundenkarte». `Supplier.categoryOrder` hält den Gang durch die Hallen dieses Markts fest.
- **Einkaufsliste:** Sie enthält, was unter «Nachkaufen ab» fällt und was der Menüplan braucht, dazu **Zeilen von Hand** (Freitext oder Artikel) und ein «Fehlt» aus dem Lager, denn am ersten Tag hat noch nichts einen Mindestbestand. Die Liste ist nach Warengruppe geordnet, in der Reihenfolge des Gangs durch den Markt (wie Rettich «Nachkaufen nach Art»). Am iPhone lässt sie sich abhaken, auch offline im Untergeschoss des Markts. Sie zeigt den zuletzt bezahlten Preis je Markt («zuletzt CHF 12.90, Markt B, 3.11.»), berechnet aus den Eingängen, nicht gespeichert.
- **Einkauf erfassen** ist ein Wareneingang mit dem Markt als Lieferant und der Beleg-Nummer. Der Entwurf entsteht aus den abgehakten Zeilen. Der Beleg muss aufgehen: Erfasst werden der **Belegtotal** und **weitere Beträge** (Depot, Depot zurück, Rabatt, Privates, nicht an Lager), und die App zeigt «Noch nicht zugeordnet: CHF 4.20». So landen Depot und Privates nicht im Wareneinsatz.
- **Kolli:** «2 Kolli à 6 × 2.5 kg, CHF 38.90 pro Kolli» wird in Basiseinheiten umgerechnet. Es zählt der Zeilenbetrag des Belegs, der Preis pro kg wird daraus berechnet. Eine **Aktion** zählt nicht als «letzter Preis» für die Kalkulation.
- **Leichter als ein Lieferschein:** Das Ablaufdatum wird nur bei Ware mit Verbrauchsdatum gefragt. Die Temperatur bei der Übernahme ist bei selbst geholter Ware freiwillig. Ein Foto des Belegs ist möglich und bleibt auf dem Gerät.
- **Später:** den Beleg fotografieren und lesen, mit der Texterkennung und dem Quittungs-Parser aus Rettich ([`../rettich.md`](../rettich.md)). Es gibt keine Anbindung an einen Markt (ADR-0011).
- Die **Warengruppe «Verpackung und Einweg»** (Box, Becher, Alufolie) kann ein Rezept verwenden. Sie gehört zu den Kosten eines Gerichts zum Mitnehmen.

### Menülinien, Mahlzeiten und Tellerrücklauf

- **Menülinien** (`MenuLine`, eigene Tabelle) sind eine feste Liste des Betriebs, zum Beispiel «Menü 1», «Vegi» oder «Leichte Vollkost». Sie sind kein Freitext je Eintrag, damit sich Statistik und Budget je Linie vergleichen lassen. Eine Linie kann zu einer Mahlzeit gehören, ein Kostenziel pro Mahlzeit haben (`costTargetRappen`) und etwas versprechen: eine Diät (`requiredDiet`) oder frei von Allergenen (`freeOf`). Widerspricht die berechnete Deklaration ihrer Gerichte dem Versprechen, warnt die App (ADR-0008). **Kostformen** sind Linien. Daten pro Bewohner:in gibt es vorerst keine: Das wären Gesundheitsdaten, und sie bräuchten einen eigenen Entscheid.
- Der **Menüplan** ordnet Gerichte Tag, Mahlzeit und Linie zu (`PlanEntry.lineId`). Zu den Mahlzeiten kommen **Znüni und Zvieri** für Heime, Kitas und Schulen. Wiederkehrende Menüs beginnen mit «Woche kopieren». Ein benannter Zyklus über mehrere Wochen kann später kommen, wird in den Plan kopiert und nie verknüpft.
- Die **Allergene je Tag und Linie** gehören zum Menüplan, nicht zur Speisekarte. Die Produktionsküche hat keine Karte und muss die Deklaration doch weitergeben, auf Lieferschein und Etikett.
- **Mahlzeiten** (`MealCount`) halten fest, wie viele erwartet und wie viele ausgegeben wurden, je Tag, Mahlzeit und Linie oder gesamt. Sie sind **kein Verkauf**: Eine Linie besteht aus mehreren Rezepten und hat oft keinen Preis. Den Umsatz erfasst ein `Sale` ohne Rezept, etwa als Tagestotal der Kasse. Der **Wareneinsatz pro Mahlzeit** ist der Verbrauch im Lager-Ledger (mit Inventurdifferenzen) geteilt durch die ausgegebenen Mahlzeiten. Er wird berechnet und nie gespeichert. `Budget.costPerMealRappen` ist das Ziel des Monats.
- **Tellerrücklauf und Ausgaberest** (`WasteWeighing`) werden in Gramm je Tag, Mahlzeit und Linie gewogen. Das ist kein Abschreiber im Ledger: Die Produktion hat die Ware schon ausgebucht, und eine gemischte Masse hat keinen Artikel. Der Wert ergibt sich aus dem Wareneinsatz pro kg des Tages.

### Auslieferung (folgt als eigenes Modul)

`dispatch` umfasst Empfänger (Schule, Kita, Heim, Firma, Kund:in), ihre festen Bestellungen je Tag und Linie, Anlässe mit Datum, Personen, Menü und Preis pro Person, Lieferschein, Etikett je Behälter, Temperatur beim Versand und die Rückverfolgung von der Charge über die Produktion zum Empfänger. Vorbedingungen: Auch fertige Gerichte bekommen aus der Produktion eine Charge (`Production.outputLotId`), und das Ledger braucht einen Abgang mit Bezug auf die Auslieferung. Das Modell (`Recipient`, `CustomerOrder`, `Dispatch`) legt das Modul fest, wenn es gebaut wird. Der Name ist «Auslieferung», nicht «Lieferung», denn «Lieferung» (`Delivery`) ist schon der Wareneingang.

### Im Code

- `packages/core/src/domain/business-profiles.ts`: Betriebsarten, Vorschläge, `proposeSetup`, `switchModule`, `modulesInUse`, `hasModule`, reine Daten und Funktionen.
- `Business.kind` (erweitert um `bistro`, `lunch`, `mensa`, `central_kitchen`, `care`, `school`), `Business.modules`, `Business.setupAt`.
- `Supplier.kind`, `Supplier.categoryOrder`, `PlanSlot` mit `morning_snack` und `afternoon_snack`, `PlanEntry.lineId`, die Tabellen `menuLines`, `mealCounts`, `wasteWeighings` (Dexie-Version 2), `Budget.costPerMealRappen`, die Warengruppe `packaging`.
- Befehle: `business.setup` (Antworten, Name, gewählte Funktionen) und `business.update` mit `modules`.
- Web: `useModules()` und `useModule(id)` (`app/modules.ts`), `useDetailed()` für die Ansicht (`app/view.ts`, ersetzt `extras.ts`). Die Navigation filtert nach `NavItem.modules`. Eine Küche, die selbst holt und nichts im Voraus bestellt, hat die Einkaufsliste als vierten Tab auf dem iPhone statt der Rezepte.

## Aus der Prüfung

**Übernommen:**

- Kleine Betriebe starten schlanker.
- Die Teamgrösse entscheidet über Team, Plätze und Ansicht.
- Die Frage nach der Ware ist mehrfach wählbar, «bestellen» wird separat gefragt.
- Der Beleg muss aufgehen, mit Depot und Privatem.
- Die Einkaufsliste hat Zeilen von Hand.
- Kolli, Aktion, mehrere Märkte und die Kundenkarte sind vorgesehen.
- «Wo essen deine Gäste?» setzt die MWST.
- Es gibt die Warengruppe «Verpackung und Einweg».
- Das Demo-Bistro wird auf dem ersten Bildschirm angeboten.
- Das Wort heisst «Funktionen» statt «Bausteine».
- Mahlzeiten und Tellerrücklauf sind eigene Daten, kein Verkauf und kein Abschreiber.
- Menülinien sind eine Liste, Kostformen sind Linien.
- Die Auslieferung ist eine eigene Funktion.
- Die Allergene je Tag und Linie gehören zum Menüplan.
- Es gibt Znüni und Zvieri.
- Abhängigkeiten zwischen Funktionen gelten.
- Der Begriff heisst «Mahlzeiten» statt «Gedecke».
- «Tagesrestaurant» ersetzt «Mittagstisch» für das Restaurant mit Mittagsmenüs.
- «Produktionsküche» ersetzt «Grossküche».
- Es gibt die Betriebsart «Kita, Schule und Mittagstisch».

**Später, als Auftrag:**

- Ein Schritt «Welche Kühlgeräte hast du?», der die Lagerbereiche anlegt (Kühlschrank statt Kühlzelle im kleinen Betrieb).
- Ein Schritt «Welche Menülinien hast du?», vorbelegt nach Betriebsart.
- Cook-&-Chill-Kontrollen in der Selbstkontrolle (Abkühlen, Regenerieren, Rückstellmuster) als Richtwert aus `fakten.md`.
- Ein benannter Menüzyklus.

**Offen, für Alban:**

- **Wareneinsatz mit oder ohne MWST:** Betriebe ohne MWST-Pflicht und solche mit Saldosteuersatz tragen die MWST als Kosten. Das braucht zuerst eine Quelle in `fakten.md`.
- **«Menu» oder «Menü»:** In der Schweizer Gastronomie ist «Menu» üblich, die App schreibt heute «Menü».
- **Begriffe für kleine Betriebe:** Erklären oder ersetzen, etwa «Abschreiber», «Wareneinsatz» oder «Mindestbestand» (Vorschläge: «Weggeworfen», «Warenkosten», «Nachkaufen ab»). Die Regel in `CLAUDE.md` nennt «Abschreiber» und «Wareneinsatz» als gute Namen. Bis zum Entscheid erklärt die App die Begriffe, statt sie zu ersetzen.

## Konsequenzen

- Jedes Modul klärt zwei Fragen: Zu welcher Funktion gehört es, und was davon ist Auswertung, die nur «Erweitert» zeigt? Die Aufträge der Module nennen es.
- Neue Einstiege prüfen `useModule`, neue Auswertungen `useDetailed`. Was zum Kern gehört, prüft keins von beiden.
- Der Demo-Betrieb ist ein Bistro mit allen Funktionen, damit man alles sieht. Weitere Demos (Kantine, Imbiss) folgen, damit sich jede Betriebsart ausprobieren lässt.
- Wörter folgen der Betriebsart, wo es zählt: «Mahlzeiten» in Kantine, Mensa und Heim, «Beleg» statt «Lieferschein» beim Markt.
