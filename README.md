# Tennis Ladder Live-Tiebreak v0.2.0

Diese Version nutzt weiterhin GitHub Pages als statisches Frontend und Supabase als zentrale Datenbank.

## Wichtig vor dem Hochladen

Die ZIP enthält bewusst keine `config.js`, damit deine funktionierende Supabase-Konfiguration nicht überschrieben wird.

Auf GitHub muss deine vorhandene `config.js` erhalten bleiben:

```js
window.TENNIS_CONFIG = {
  supabaseUrl: "https://DEIN-PROJEKT.supabase.co",
  supabaseAnonKey: "DEIN-PUBLISHABLE-ODER-ANON-KEY"
};
```

## Update von v0.1.2 auf v0.2.0

1. In Supabase den SQL Editor öffnen.
2. Den kompletten Inhalt aus `database.sql` einfügen.
3. `Run` ausführen.
4. Danach auf GitHub diese Dateien ersetzen:
   - `index.html`
   - `style.css`
   - `app.js`
   - `README.md`
5. `config.js` nicht ersetzen.

## Neue Funktionen in v0.2.0

- Testmodus: erster Spieler mit 3 Punkten gewinnt.
- Kein 2-Punkte-Abstand mehr nötig.
- Live-Matches über zwei Geräte.
- Aufschlag/Schlag wird verdeckt gespeichert.
- Gegner sieht erst danach seine Reaktionsauswahl.
- Automatisches Polling alle ca. 2,5 Sekunden.
- 5-Minuten-Frist pro Eingabe.
- Nach Ablauf kann der wartende Gegner einen Timeout-Sieg reklamieren.
- Live-Spiel kann direkt aus der Rangliste gestartet werden.
- Live-Spiel kann aus einer angenommenen Forderung gestartet werden.

## Ablauf Live-Spiel

1. Spieler A startet ein Live-Match gegen Spieler B oder aus einer angenommenen Forderung.
2. Die Datenbank wirft die Münze und bestimmt den ersten Aufschläger.
3. Der Spieler, der dran ist, wählt verdeckt Aufschlag oder Schlag mit Risiko.
4. Der andere Spieler bekommt erst danach seine Lese-/Return-Auswahl.
5. Supabase berechnet den Punkt zentral.
6. Bei 3 Punkten wird das Match automatisch gespeichert und die Rangliste aktualisiert.

## Timeout-Regel

Pro Eingabe läuft eine Frist von 5 Minuten.

Wenn der Spieler, der dran ist, nicht rechtzeitig spielt, kann der andere Spieler auf **Timeout-Sieg reklamieren** klicken. Dann wird das Match als Sieg für den wartenden Spieler gespeichert.

## Technischer Hinweis

Das Live-Spiel nutzt bewusst Polling statt Supabase Realtime. Das ist für GitHub Pages einfacher, robuster und reicht für diese Spielform aus.
