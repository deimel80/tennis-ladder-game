# Tennis Ladder Match-Tiebreak Arena v0.1.2

Statisches Browser-Spiel für GitHub Pages mit zentraler Supabase-Speicherung.

## Wichtiges Update von v0.1.2

- Der lokale Demo-Modus wurde entfernt.
- Es werden keine Fake-Spieler mehr erzeugt.
- Rangliste, Forderungen und Matches laufen ausschließlich über Supabase.
- Die ZIP enthält bewusst keine echte `config.js`, damit eine bereits konfigurierte Datei bei GitHub nicht überschrieben wird.

## Dateien für GitHub Pages

Diese Dateien ins Root-Verzeichnis deines GitHub-Repositories hochladen/ersetzen:

```text
index.html
style.css
app.js
README.md
```

Diese Datei ist nur Vorlage:

```text
config.example.js
```

## config.js

Im Repository muss zusätzlich eine echte `config.js` liegen:

```js
window.TENNIS_CONFIG = {
  supabaseUrl: "https://DEIN-PROJEKT.supabase.co",
  supabaseAnonKey: "DEIN-PUBLISHABLE-ODER-ANON-KEY"
};
```

Wenn du die alte funktionierende `config.js` noch in GitHub hast: nicht überschreiben.

Wenn du sie versehentlich überschrieben hast: Supabase öffnen → Projekt → Connect oder Project Settings → API Keys → Project URL und Publishable/Anon Key wieder in `config.js` eintragen.

## Supabase

Bei einer bestehenden Installation musst du `database.sql` normalerweise nicht erneut ausführen.

Bei einer Neuinstallation:

1. Supabase-Projekt erstellen.
2. SQL Editor öffnen.
3. Inhalt von `database.sql` komplett ausführen.
4. `config.js` mit Project URL und Publishable/Anon Key erstellen.
5. Dateien auf GitHub Pages hochladen.

## Stand v0.1.2

- öffentliche Rangliste vor Login
- Spielerregistrierung mit Name + 4-stelliger PIN
- Login
- Forderungen erstellen/annehmen/abbrechen
- direktes Match starten
- Match-Tiebreak bis 10 mit 2 Punkten Abstand
- Aufschlagfolge 1–2–2–2
- textbasierte Schlagwahl mit Risiko 0–150 %
- Ergebnis zentral speichern
- Rangliste nach Sieg gegen höherplatzierten Spieler aktualisieren
