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

5. **Vorschau-Builds einschalten:** im Projekt **Settings → Build → Branch control → Enable Preview Builds**.
6. **Deploy** tippen. Der erste Build dauert ein bis zwei Minuten.

Danach gibt es `https://randen.<dein-name>.workers.dev` für `main` und pro PR einen Link wie `https://<branch>-randen.<dein-name>.workers.dev`.

## So schaust du eine Vorschau an

- Link öffnen. Der Betrieb ist leer: Unter **Mehr → Demo-Betrieb laden** siehst du eine eingerichtete Küche mit Lager, Rezepten, Speisekarte und Zahlen.
- Der Styleguide mit allen Bausteinen liegt unter `/styleguide`.
- Jede Vorschau-Adresse hat ihren eigenen Speicher im Browser. Nichts geht an einen Server.

## Kosten und Grenzen

- **Kostenlos im Free-Plan** (3000 Build-Minuten pro Monat, Aufrufe der statischen App unbegrenzt).
- **Die Links sind öffentlich**, aber nicht auffindbar (`noindex`), und es liegen keine echten Betriebsdaten dort. Wer sie sperren will, schaltet Cloudflare Access davor; das ist Albans Entscheid.
- Bis ein Betrieb echte Daten erfasst, ist die Adresse von `main` eine Demo. Ab dem ersten Pilotbetrieb gilt: Die Adresse ist dann die App dieses Betriebs auf seinem Tablet; ein Wechsel der Adresse heisst vorher sichern, danach zurückholen (Lektion aus Rettich, L-11).

## Wenn etwas nicht klappt

- **Build rot:** im Projekt unter **Deployments** das Log öffnen und den Schluss an Claude schicken.
- **«An unknown error has occurred» im letzten Schritt** (`wrangler preview` oder `wrangler deploy`), obwohl der Build durchlief: Störung bei Cloudflare, einmal **Retry build** tippen.
