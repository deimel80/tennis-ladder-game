# Court Clash v0.9.3

Browser-Spiel für GitHub Pages mit zentraler Supabase-Speicherung.

## Update-Hinweis

Diese ZIP enthält bewusst keine produktive `config.js`. Deine bestehende `config.js` mit Supabase-URL und Publishable/Anon-Key darf nicht überschrieben werden.

Für das Update:

1. `database.sql` in Supabase komplett ausführen.
2. Auf GitHub diese Dateien ersetzen:
   - `index.html`
   - `style.css`
   - `app.js`
   - `README.md`
   - `hero-tennis.png`
3. `config.js` unverändert lassen.

## Neu in v0.9.3

- Passwort statt 4-stelliger PIN für neue Registrierungen.
- Bestehende alte PINs bleiben als bisheriges Passwort weiter nutzbar.
- In-App-Nachrichten für:
  - neue Forderungen,
  - angenommene Ranglistenspiele,
  - laufende Live-Matches,
  - Turnierstarts innerhalb der nächsten 24 Stunden,
  - bereite Turniermatches.
- Keine E-Mail-Adressen und keine zusätzlichen personenbezogenen Benachrichtigungsdaten.
- Nachrichten erscheinen automatisch nach Login beziehungsweise bei gespeicherter Session beim Öffnen der Seite.

## Bestehende Funktionen

- zentrale Rangliste über Supabase
- Admin-Freigabe für neue Spieler
- Ranglisten-Forderungen mit begrenztem Forderungsbereich
- Kurzspiele ohne Ranglistenwertung
- Live-Spiel über zwei Geräte
- geplante K.O.-Turniere mit Anmeldung, Tableau und Freilosen
- Turniersieger und zweite Plätze als Pokale im Profil
- Spielerprofile mit Match-Historie
- Hall of Fame
- Admin kann Spielernamen ändern

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
- `hero-tennis.png` – Startseitenbild
- `config.example.js` – Beispiel für die Konfiguration


## v0.9.3
- Profilseite als moderne Spielerkarte überarbeitet
- 2x2-Statistikbereich für Mobile optimiert
- Pokale dezenter und hochwertiger integriert
