# Glossar

Begriffe in der App (deutsch), im Code (englisch) und was sie bedeuten. Neue Begriffe kommen hierher, bevor sie in der App stehen.

| In der App | Im Code | Bedeutung |
| --- | --- | --- |
| Betrieb | `Business` | Eine Küche mit ihrem Lager, ihren Rezepten und Zahlen. Ein zweiter Standort ist ein zweiter Betrieb |
| Team, Person | `StaffMember` | Wer auf dem Gerät arbeitet; steht bei jeder Buchung |
| Lagerbereich | `StorageArea` | Kühlzelle, Tiefkühlzelle, Trockenlager, Bar und Keller; mit Temperaturbereich |
| Platz | `StorageSpot` | Ein benannter Ort im Lagerbereich, mit Foto: «Regal 2, oben» |
| Wo ist was? | `where.search` | Suche nach einem Artikel, zeigt Bereich, Platz und Foto |
| Rundgang | `tour` | Alle Plätze der Reihe nach, für neue Mitarbeitende |
| Artikel | `Article` | Was an Lager liegt: eingekaufte Ware oder Eigenproduktion |
| Eigenproduktion | `Article.kind = 'prepared'`, `Recipe.kind = 'component'` | Im Haus hergestellte Komponente (Jus, Fond, Teig), mise en place |
| Lieferant | `Supplier` | Wer Ware liefert; mit Bestell- und Liefertagen |
| Charge | `StockLot` | Eine Lieferung oder Produktion eines Artikels mit eigenem Datum und Preis |
| Lagerbewegung | `StockMovement` | Eine Zeile im Journal: Wareneingang, Eigenproduktion, Verbrauch, Abschreiber, Korrektur |
| Wareneingang | `stock.receive`, `Delivery` | Ware annehmen: Lieferschein, Kontrolle an der Tür, Chargen |
| Abschreiber | `MovementType 'waste'` | Ware, die nicht verkauft wird: abgelaufen, verdorben, Überproduktion, Rüstabfall, Tellerrest, beschädigt |
| Inventur | `InventoryCount` | Zählen, was da ist; Differenzen werden Korrekturen |
| Mindestbestand, Sollbestand | `minStock`, `targetStock` | Unter dem Mindestbestand erscheint der Artikel im Bestellvorschlag; aufgefüllt wird bis zum Sollbestand |
| FEFO | `allocateFefo` | First expired, first out: Das früheste Datum geht zuerst |
| Mindestens haltbar bis (MHD) | `DateKind 'best_before'` | Oft länger gut; der Entscheid liegt beim Betrieb |
| Zu verbrauchen bis | `DateKind 'use_by'` | Danach nicht mehr verwenden |
| Ausbeute | `yieldBps` | Was nach dem Rüsten bleibt, in Prozent |
| Nettomenge, Bruttomenge | `quantity`, `grossQuantity` | Netto kommt in die Pfanne, brutto geht vom Lager (netto ÷ Ausbeute) |
| Rezept, Gericht, Komponente | `Recipe`, `kind 'dish' \| 'component'` | Ein Gericht wird portionenweise verkauft, eine Komponente füllt einen Artikel |
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
| Budget | `Budget` | Was der Betrieb in einem Monat für Ware ausgeben will |
| Gewinner, Renner, Schläfer, Verlierer | `MenuClass` | Die vier Felder des Menu-Engineerings: beliebt und rentabel, beliebt, rentabel, weder noch |
| Selbstkontrolle | `haccp` | Temperaturen, Reinigungsplan, Wareneingangskontrolle |
| Richtwert | – | Ein Vorschlag ohne rechtliche Verbindlichkeit, den der Betrieb ändern kann (ADR-0012) |
| Sicherung | `settings.export` | Der ganze Betrieb als eine Datei |
