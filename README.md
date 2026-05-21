# Court Clash Live-Tiebreak v0.6.0

Statisches Browser-Spiel für GitHub Pages mit zentraler Supabase-Speicherung.

## Wichtig beim Update

Diese ZIP enthält bewusst keine produktive `config.js`. Deine bestehende `config.js` mit Supabase-URL und Publishable/Anon-Key darf nicht überschrieben werden.

Für ein bestehendes Projekt:

1. `database.sql` in Supabase komplett ausführen.
2. Auf GitHub diese Dateien ersetzen:
   - `index.html`
   - `style.css`
   - `app.js`
   - `README.md`
3. `config.js` unverändert lassen.

## Neue Funktionen in v0.6.0

- Geplante K.O.-Turniere:
  - Admin erstellt mehrere Turniere mit Name, Datum, Startzeit, Anmeldeschluss und maximaler Teilnehmerzahl.
  - Spieler melden sich für Turniere an oder ab, solange die Anmeldung offen ist.
  - Admin generiert ein Tableau mit Freilosen.
  - Turniermatches laufen als echtes Zwei-Geräte-Live-Spiel.
  - Turniersieger und Zweitplatzierte werden gespeichert.
  - Profil/Rangliste zeigen Pokale: 🏆 Turniersiege und 🥈 zweite Plätze.
  - Turniere zählen nicht automatisch für die Rangliste.
- Ranglisten-Forderungen sind begrenzt:
  - Top 3: nur den direkt davor platzierten Spieler.
  - Top 10: maximal 2 Plätze nach oben.
  - ab Rang 11: maximal 5 Plätze nach oben.
- Neue Spieler starten nach Admin-Freigabe unten in der Rangliste.
- Pro Spieler ist nur eine aktive Forderung oder ein laufendes Live-Spiel erlaubt.
- Offene Forderungen laufen nach 24 Stunden ab.
- Angenommene Forderungen laufen nach 30 Minuten ab, wenn kein Spiel gestartet wird.
- Gleicher Gegner ist erst nach 12 Stunden wieder ranglistenrelevant forderbar.
- Kurzspiel eingebaut:
  - direkt aus der Rangliste startbar.
  - echtes Live-Spiel über zwei Geräte.
  - zählt nicht für Rangliste und nicht für Statistik.
- Timeout bleibt bei 5 Minuten pro Eingabe.
- Spielziel bleibt für Tests: erster Spieler mit 3 Punkten gewinnt, ohne 2-Punkte-Abstand.

## Supabase-Konfiguration

`config.js` muss im GitHub-Repository liegen:

```js
window.TENNIS_CONFIG = {
  supabaseUrl: "https://DEIN-PROJEKT.supabase.co",
  supabaseAnonKey: "DEIN-PUBLISHABLE-ODER-ANON-KEY"
};
```

Niemals einen Secret Key oder Service Role Key in `config.js` eintragen.

## Dateien

- `index.html` – Oberfläche
- `style.css` – Layout und Optik
- `app.js` – Spiellogik und Supabase-Anbindung
- `database.sql` – Tabellen, Regeln und RPC-Funktionen für Supabase
- `config.example.js` – Beispiel für die Konfiguration


## v0.6.0

- Oberfläche entzerrt: Übersicht/Rangliste, Spiele, Turniere und Admin sind getrennte Bereiche.
- Turniere liegen auf eigener Seite im Spiel, damit die Rangliste nicht überladen wirkt.
- Keine Datenbankänderung gegenüber v0.4.0 erforderlich.


## Neu in v0.6.0
- schöne Startseite mit Hero-Bereich, Top-Spielern und Direkteinstiegen
- öffentliche Startseite vor dem Login mit Link zur Rangliste und zum Login
- neue Navigation mit separatem Start- und Ranglisten-Reiter


## Neu in v0.6.0
- reduzierte öffentliche Startseite mit großem Tennisbild und klarem Einstieg
- Button „Zum Spiel“ führt in den eigentlichen Spielbereich
- öffentlicher Spielbereich vor Login deutlich entschlackt
- eingeloggtes Dashboard weniger überladen
- bessere Handy-Ansicht mit weniger Text und einspaltigen Karten
