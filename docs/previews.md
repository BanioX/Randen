# Vorschau-Links auf Cloudflare

Damit du jeden Stand am Handy und am Tablet anschauen kannst: `main` läuft unter einer festen Adresse, und jeder PR bekommt automatisch einen eigenen Vorschau-Link. Cloudflare schreibt den Link als Kommentar in den PR. Es wird nur die gebaute App ausgeliefert (statische Dateien); alle Daten bleiben im Browser des Geräts (ADR-0006).

## Einmal einrichten (ca. 5 Minuten, geht am Handy)

1. **dash.cloudflare.com** öffnen und anmelden.
2. **Workers & Pages** → **Erstellen** → **Repository importieren**.
3. **GitHub verbinden.** Bei «Only select repositories» zusätzlich `BanioX/Randen` wählen.
4. Repo **Randen** auswählen und so ausfüllen:

   | Feld | Wert |
   | --- | --- |
   | Projektname | `randen` (genau so, sonst öffnet Cloudflare einen Korrektur-PR) |
   | Build-Befehl | `pnpm build:cf` |
   | Deploy-Befehl | `npx wrangler deploy` (Standard lassen) |
   | Vorschau-Befehl | `npx wrangler preview` (Standard lassen) |
   | Pfad | leer lassen |
   | Variablen, Secrets | keine |

5. **Deploy** tippen. Der erste Build baut `main`; solange dort nur die Start-Datei liegt, wird er rot. Das ist kein Fehler im Code.
6. Im Projekt **Settings → Build → Branch control**:
   - **Production branch** vorläufig auf den Arbeits-Branch `claude/pensive-fermi-n01le6` stellen (Stand 14.11.2026). So läuft unter der festen Adresse immer der neuste Stand.
   - **Enable Preview Builds** einschalten.
7. Der nächste Push auf den Arbeits-Branch startet den Build; nach ein bis zwei Minuten läuft Randen.

Danach gibt es `https://randen.<dein-name>.workers.dev` (Production) und pro anderem Branch eine eigene Vorschau-Adresse. Die feste Adresse hängt am Projektnamen, nicht am Branch.

**Namen bleiben:** Die Projektnamen `randen` und `fridgeai` (Rettich) und der Name des Kontos werden nie umbenannt, denn sie bilden die Adresse: Eine neue Adresse ist für den Browser eine andere App mit leerem Speicher, und die Daten blieben auf jedem Gerät an der alten Adresse liegen (ADR-0020).

**Vor dem ersten Pilotbetrieb** wird `main` zur Production: Den Arbeits-Branch per PR nach `main` bringen und unter **Branch control** wieder `main` wählen. Die Adresse bleibt gleich, das Symbol auf dem Home-Bildschirm passt weiter.

## So schaust du eine Vorschau an

- Link öffnen. Der Betrieb ist leer, und das Cockpit bietet «Randen einrichten» an. Eine eingerichtete Küche, ein Bistro mit acht Wochen Geschichte (Lager, Rezepte, Speisekarte, Menüplan und Zahlen), lädst du unter **Mehr → Demo-Betrieb → Demo-Betrieb laden** (auf iPad und Web unter **Betrieb**) oder im Einrichten mit «Erst das Demo-Bistro ansehen». «Demo-Daten entfernen» räumt sie wieder ab.
- Am iPhone und iPad: **Teilen → Zum Home-Bildschirm**. Dann öffnet sich Randen im Vollbild mit eigenem Symbol.
- Der Styleguide mit allen Bausteinen liegt unter `/styleguide`.
- Jede Vorschau-Adresse hat ihren eigenen Speicher im Browser. Nichts geht an einen Server.

## Kosten und Grenzen

- **Kostenlos im Free-Plan** (3000 Build-Minuten pro Monat, Aufrufe der statischen App unbegrenzt).
- **Die Links sind öffentlich**, aber nicht auffindbar (`noindex`), und es liegen keine echten Betriebsdaten dort. Wer sie sperren will, schaltet Cloudflare Access davor; das ist Albans Entscheid.
- Bis ein Betrieb echte Daten erfasst, ist die Adresse von `main` eine Demo. Ab dem ersten Pilotbetrieb gilt: Die Adresse ist dann die App dieses Betriebs auf seinem Tablet; ein Wechsel der Adresse heisst vorher sichern, danach zurückholen (Lektion aus Rettich, L-11).

## Wenn etwas nicht klappt

- **Build rot:** im Projekt unter **Deployments** das Log öffnen und den Schluss an Claude schicken.
- **«An unknown error has occurred» im letzten Schritt** (`wrangler preview` oder `wrangler deploy`), obwohl der Build durchlief: Störung bei Cloudflare, einmal **Retry build** tippen.
