# Glossar

Begriffe in der App (deutsch), im Code (englisch) und was sie bedeuten. Neue Begriffe kommen hierher, bevor sie in der App stehen.

| In der App | Im Code | Bedeutung |
| --- | --- | --- |
| Betrieb | `Business` | Eine Küche mit ihrem Lager, ihren Rezepten und Zahlen. Ein zweiter Standort ist ein zweiter Betrieb |
| Team, Person | `StaffMember` | Wer auf dem Gerät arbeitet; steht bei jeder Buchung |
| Lagerbereich | `StorageArea` | Kühlzelle, Tiefkühlzelle, Trockenlager, Bar und Weinkeller, Posten; mit Temperaturbereich |
| Posten | `AreaKind 'station'` | Der Kühlschrank und die Ablage einer Station der Küche (Garde-manger, Pâtisserie) mit der Mise en place des Tages |
| Platz | `StorageSpot` | Ein benannter Ort im Lagerbereich, mit Foto: «Regal 2, oben» |
| Lagerort | `areaId`, `spotId` am Artikel | Wo ein Artikel hingehört: der Lagerbereich und, wenn es ihn gibt, der Platz |
| Wo ist was? | `where.search` | Suche nach einem Artikel, zeigt Bereich, Platz und Foto |
| Rundgang | `tour` | Alle Plätze der Reihe nach, für neue Mitarbeitende |
| Artikel | `Article` | Was an Lager liegt: eingekaufte Ware oder Eigenproduktion |
| Eigenproduktion | `Article.kind = 'prepared'`, `Recipe.kind = 'component'` | Im Haus hergestellte Komponente (Jus, Fond, Teig), mise en place |
| Lieferant | `Supplier` | Wer Ware liefert; mit Bestell- und Liefertagen |
| Charge | `StockLot` | Eine Lieferung oder Produktion eines Artikels mit eigenem Datum und Preis |
| Lagerbewegung | `StockMovement` | Eine Zeile im Journal: Wareneingang, Eigenproduktion, Verbrauch, Abschreiber, Korrektur |
| Wareneingang | `stock.receive`, `Delivery` | Ware annehmen: Lieferschein, Kontrolle an der Tür, Chargen |
| Abschreiber | `MovementType 'waste'` | Ware, die nicht verkauft wird: abgelaufen, verdorben, Überproduktion, Rüstabfall, Tellerrücklauf, beschädigt |
| Lagerverlust, Produktionsabfall, Tellerrücklauf | `WasteKind` | Die drei Arten von Abschreibern, nach dem Ort, an dem sie entstehen |
| Inventur | `InventoryCount` | Zählen, was da ist; Differenzen werden Korrekturen |
| Mindestbestand, Sollbestand | `minStock`, `targetStock` | Unter dem Mindestbestand erscheint der Artikel im Bestellvorschlag; aufgefüllt wird bis zum Sollbestand |
| FEFO, FIFO | `allocateFefo`, `fefoOrder` | First expired, first out: Das früheste Datum geht zuerst. Ohne Datum oder bei gleichem Datum gilt first in, first out: die ältere Lieferung zuerst. Was sein Verbrauchsdatum hinter sich hat, wird nie genommen |
| Mindestens haltbar bis (MHD) | `DateKind 'best_before'` | Oft länger gut; der Entscheid liegt beim Betrieb |
| Zu verbrauchen bis | `DateKind 'use_by'` | Danach nicht mehr verwenden |
| Ausbeute | `yieldBps` | Was nach dem Rüsten bleibt, in Prozent |
| Nettomenge, Bruttomenge | `quantity`, `grossQuantity` | Netto kommt in die Pfanne, brutto geht vom Lager (netto ÷ Ausbeute) |
| Rezept, Gericht, Komponente | `Recipe`, `kind 'dish' \| 'component'` | Ein Gericht wird portionenweise verkauft, eine Komponente füllt einen Artikel |
| Ansatz | `Recipe.output` | Die Menge, die ein Rezept einer Komponente ergibt («ein Ansatz ergibt 1 l») |
| Kochansicht | `recipeCook` | Rezept gross, mit umgerechneten Mengen, für den Pass |
| Wareneinsatz | `recipeCost`, `foodCostBps` | Warenkosten einer Portion; als Anteil am Nettopreis in Prozent |
| Deckungsbeitrag | `marginRappen` | Nettopreis minus Wareneinsatz einer Portion |
| Preisvorschlag | `suggestedPrice` | Der Preis, bei dem der Wareneinsatz dem Ziel entspricht |
| Produktion | `Production` | Ein Rezept wurde gekocht: Zutaten gehen vom Lager, eine Komponente kommt hinein |
| Menüplan | `PlanEntry` | Welches Gericht an welchem Tag, mit erwarteten Portionen |
| Reste verwerten | `plan.suggest` | Vorschlag für Gerichte, die Ware nutzen, die bald abläuft |
| Speisekarte | `MenuCard` | Karte für Gäste mit Foto, Preis, Allergenen, Herkunft |
| Gästeansicht | `guest` | Die Speisekarte im Vollbild, mit Filter nach Allergenen |
| Bestellvorschlag, Bestellung | `purchasing.suggestions`, `PurchaseOrder` | Was nachzukaufen ist, nach Lieferant; die Bestellung verschickt die Person selbst |
| Verkauf | `Sale` | Verkaufte Portionen eines Gerichts an einem Tag, oder Umsatz ohne Rezept |
| Budget | `Budget` | Was der Betrieb in einem Monat für Ware ausgeben will, sein Umsatzziel und seine Fixkosten |
| Break-even | `breakEven` | Der Umsatz, ab dem der Deckungsbeitrag die Fixkosten deckt: ab hier verdient die Küche Geld |
| Demo-Betrieb | `demo.load` | Eine eingerichtete Beispielküche zum Ausprobieren, mit erfundenen Namen und Preisen |
| Gewinner, Renner, Schläfer, Verlierer | `MenuClass` | Die vier Felder des Menu-Engineerings: beliebt und rentabel, beliebt, rentabel, weder noch |
| Selbstkontrolle | `haccp` | Temperaturen, Reinigungsplan, Wareneingangskontrolle |
| Richtwert | – | Ein Vorschlag ohne rechtliche Verbindlichkeit, den der Betrieb ändern kann (ADR-0012) |
| Sicherung | `settings.export` | Der ganze Betrieb als eine Datei |
| Betriebsart | `BusinessKind` | Was für ein Betrieb das ist, vom Imbiss bis zur Produktionsküche; schlägt die Funktionen vor (ADR-0015) |
| Funktion | `ModuleId`, `useModule` | Womit der Betrieb arbeitet, unter «Betrieb › Funktionen» schaltbar: Speisekarte, Bestellen, Einkauf im Markt, Produktion, Menüplan, Mahlzeiten zählen, Auslieferung, Verkäufe, Budget und Zahlen, Wo ist was?, Team. Im Entscheid «Baustein» (ADR-0015) |
| Randen einrichten | `business.setup`, `/setup` | Die Fragen nach Betriebsart, Ware, Team und Name, die die Funktionen vorschlagen |
| Grundfunktionen, Erweitert | `view.ts`, `useDetailed` | Die Ansicht eines Geräts: «Erweitert» zeigt ausführliche Auswertungen, Verlauf und Journal, sonst das Wichtigste (ADR-0014, ADR-0015) |
| Markt, Cash & Carry | `Supplier.kind = 'market'` | Wo die Küche selbst einkauft und an der Kasse zahlt; keine Bestell- und Liefertage |
| Beleg | – | Die Quittung eines Einkaufs im Markt; sie muss mit Belegtotal, Depot und Privatem aufgehen |
| Kolli | – | Eine Verpackungseinheit im Handel, zum Beispiel 6 × 2.5 kg |
| Menülinie | `MenuLine` | Eine feste Linie des Menüplans, etwa «Menü 1», «Vegi», «Leichte Vollkost»; auch Kostformen sind Linien |
| Mahlzeiten | `MealCount` | Erwartete und ausgegebene Mahlzeiten je Tag, Mahlzeit und Linie; kein Verkauf |
| Wareneinsatz pro Mahlzeit | – | Verbrauch im Lager-Ledger geteilt durch die ausgegebenen Mahlzeiten; berechnet |
| Tellerrücklauf, Ausgaberest | `WasteWeighing` | Was auf den Tellern zurückkommt oder an der Ausgabe übrig bleibt, in Gramm gewogen; kein Abschreiber |
| Znüni, Zvieri | `morning_snack`, `afternoon_snack` | Zwischenmahlzeiten am Vormittag und am Nachmittag, in Heimen, Kitas und Schulen |
| Auslieferung | `dispatch` | Lieferung an Aussenstellen und Anlässe, mit Lieferschein, Etikett und Rückverfolgung; nicht zu verwechseln mit dem Wareneingang (`Delivery`) |
