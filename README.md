# Tennis Ladder Live-Tiebreak v0.2.1

Diese Version nutzt GitHub Pages als statisches Frontend und Supabase als zentrale Datenbank.

## Wichtig vor dem Hochladen

Die ZIP enthält bewusst keine `config.js`, damit deine funktionierende Supabase-Konfiguration nicht überschrieben wird.

Auf GitHub muss deine vorhandene `config.js` erhalten bleiben:

```js
window.TENNIS_CONFIG = {
  supabaseUrl: "https://DEIN-PROJEKT.supabase.co",
  supabaseAnonKey: "DEIN-PUBLISHABLE-ODER-ANON-KEY"
};
```

## Update von v0.2.0 auf v0.2.1

1. In Supabase den SQL Editor öffnen.
2. Den kompletten Inhalt aus `database.sql` einfügen.
3. `Run` ausführen.
4. Danach auf GitHub diese Dateien ersetzen:
   - `index.html`
   - `style.css`
   - `app.js`
   - `README.md`
5. `config.js` nicht ersetzen.

## Neue Funktionen in v0.2.1

- Neue Spieler werden nach Registrierung nicht sofort in die Rangliste aufgenommen.
- Ein Admin muss neue Spieler freigeben.
- Freigegebene Spieler werden unten an die Rangliste angehängt.
- Admins sehen im Lobby-Bereich eine Freigabeliste.
- Der direkte Live-Match-Button wurde aus der Rangliste entfernt; direkte Live-Spiele sind auch serverseitig deaktiviert.
- Der saubere Ablauf ist jetzt: `Fordern -> Annehmen -> Live-Spiel starten`.
- Gute Schläge, Service-Winner, perfekt gelesene Returns und Drucksituationen bekommen zusätzliche Sprüche im Punkttext.

## Admin-Hinweis

Beim ersten leeren Setup wird der erste registrierte Spieler automatisch Admin und direkt freigegeben.

Bei bestehenden Installationen setzt das SQL vorhandene Spieler auf freigegeben. Falls ein Spieler `Stefan` existiert, wird dieser automatisch Admin. Wenn nicht, wird der bestplatzierte vorhandene Spieler Admin.

## Aktuelle Testregeln

- Erster Spieler mit 3 Punkten gewinnt.
- Kein 2-Punkte-Abstand.
- Aufschlagfolge: Münzwurf, dann 1-2-2 wie im Match-Tiebreak.
- Pro Eingabe läuft eine 5-Minuten-Frist.
- Nach Ablauf kann der andere Spieler einen Timeout-Sieg reklamieren.

## Ablauf Ranglistenspiel

1. Spieler A fordert Spieler B.
2. Spieler B nimmt die Forderung an.
3. Einer der beiden startet das Live-Spiel aus der Forderung.
4. Beide Spieler spielen auf ihren eigenen Geräten.
5. Das Ergebnis wird automatisch gespeichert.
6. Die Rangliste wird bei einem Sieg gegen einen höher platzierten Spieler automatisch angepasst.

## Technischer Hinweis

Das Live-Spiel nutzt Polling statt Supabase Realtime. Das ist für GitHub Pages einfacher, robuster und reicht für diese Spielform aus.
