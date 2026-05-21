# Tennis Ladder Match-Tiebreak v0.1.1

Ein textbasiertes Tennis-Forderungsspiel für GitHub Pages mit zentraler Speicherung über Supabase.

## Enthalten

```text
tennis-ladder-game-v0.1.1/
├─ index.html
├─ style.css
├─ app.js
├─ config.js
├─ config.example.js
├─ database.sql
└─ README.md
```

## Funktionen in v0.1.1

- Spieler mit Name + 4-stelliger PIN anlegen
- Spieler anmelden
- zentrale Rangliste über Supabase
- Spieler fordern
- Forderung annehmen / abbrechen
- direktes Match gegen einen Spieler starten
- Match-Tiebreak bis 10, Sieg mit 2 Punkten Vorsprung
- Aufschlagreihenfolge: erster Punkt Münzwurf, danach 2er-Blöcke
- Aufschläge: Slice außen, Slice Mitte, Kick Mitte, Kick Körper, glatt Mitte, Körper
- Risiko-Regler je Schlag von 0 bis 150 Prozent
- Returner/Gegner kann sich auf den Schlag einstellen
- falsches Lesen erhöht die Chance auf Winner/Fehler
- längere Ballwechsel erhöhen die Fehlerwahrscheinlichkeit
- Netzangriff und Volley-/Smash-Optionen
- Match-Log und Punkt-Protokoll
- automatische Ranglistenänderung bei Sieg gegen höher platzierten Spieler

## Supabase einrichten

1. Supabase-Projekt erstellen.
2. Supabase öffnen.
3. Links auf **SQL Editor** gehen.
4. **New query** öffnen.
5. Inhalt aus `database.sql` einfügen.
6. Query ausführen.
7. Danach im Supabase Dashboard zu **Project Settings → API** gehen.
8. Project URL und anon/publishable key kopieren.
9. In `config.js` eintragen:

```js
window.TENNIS_CONFIG = {
  supabaseUrl: "https://DEIN-PROJEKT.supabase.co",
  supabaseAnonKey: "DEIN-ANON-ODER-PUBLISHABLE-KEY"
};
```

## GitHub Pages hochladen

1. Neues GitHub-Repository erstellen.
2. Diese Dateien ins Repository laden.
3. In GitHub zu **Settings → Pages** gehen.
4. Source: `Deploy from a branch`.
5. Branch: `main`, Folder: `/root`.
6. Speichern.
7. GitHub zeigt danach die öffentliche URL an.

## Demo-Modus

Wenn `config.js` leer bleibt, läuft die App im Demo-Modus. Dann werden Daten nur im aktuellen Browser gespeichert.

Demo-Spieler:

```text
Stefan, Alex, Ben, Chris, Daniel, Markus
PIN: 1234
```

Dieser Modus ist nur zum Testen der Spiellogik gedacht. Für echte Nutzung mit mehreren Spielern muss Supabase konfiguriert sein.

## Ranglistenregel

Wenn ein niedriger platzierter Spieler gegen einen höher platzierten Spieler gewinnt, springt der Gewinner auf die Position des Verlierers. Alle Spieler dazwischen rutschen einen Rang nach unten.

Beispiel:

```text
Vorher:
1 Alex
2 Ben
3 Chris
4 Stefan

Stefan schlägt Ben.

Nachher:
1 Alex
2 Stefan
3 Ben
4 Chris
```

Wenn ein höher platzierter Spieler gegen einen niedriger platzierten Spieler gewinnt, bleibt die Rangliste unverändert.

## Wichtige MVP-Einschränkung

Die App nutzt eine einfache PIN-Sitzung und RPC-Funktionen in Supabase. Für einen Freundeskreis ist das als erste Version ausreichend. Für einen öffentlichen Wettbewerb mit fremden Nutzern sollte später echter Supabase-Auth-Login, Ergebnisbestätigung durch beide Spieler und optional Admin-Freigabe ergänzt werden.

## Nächste sinnvolle Versionen

- v0.2.0: Ergebnis muss vom Gegner bestätigt werden
- v0.3.0: echte Benutzerverwaltung mit Supabase Auth
- v0.4.0: Live-Match auf zwei Geräten statt Pass-and-Play
- v0.5.0: Spielerwerte wie Aufschlag, Return, Kondition, Nervenstärke
- v0.6.0: Turniere und Saison-Historie
