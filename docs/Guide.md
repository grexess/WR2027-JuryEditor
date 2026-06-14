# Jury Editor – Einrichtungsanleitung

## Wie der Zugang funktioniert

Jeder Kampfrichter erhält eine persönliche URL mit einem geheimen Token. Ohne den richtigen Token zeigt die Seite „Zugang verweigert" und nichts funktioniert.

## Schritt 1 – Tokens festlegen

`config.js` öffnen und den Abschnitt `judgeTokens` bearbeiten:

```js
judgeTokens: {
    'WR27-J1-ALICE': 'Alice',
    'WR27-J2-BOB':   'Bob',
    'WR27-J3-CAROL': 'Carol',
},
```

Die Token-Strings (linke Seite) können beliebig gewählt werden. Der Name (rechte Seite) erscheint auf dem Wertungsbildschirm.

## Schritt 2 – Jedem Kampfrichter seine URL geben

```
https://yourhost/jury.html?token=WR27-J1-ALICE
https://yourhost/jury.html?token=WR27-J2-BOB
https://yourhost/jury.html?token=WR27-J3-CAROL
```

Jede URL als QR-Code übermitteln oder auf dem Tablet des Kampfrichters als Lesezeichen speichern. Tokens vertraulich behandeln.

## Schritt 3 – Starter öffnen

Der Ansager öffnet `starter.html` auf einem separaten Gerät. Sobald er einen Starter bestätigt, aktualisieren sich alle drei Jury-Bildschirme automatisch.

## Das war's

- Falscher oder fehlender Token → Zugang verweigert
- Jeder Kampfrichter sieht nur seinen eigenen Bildschirm
- Zugang entziehen: Token aus `config.js` entfernen

---

## Wechsel zwischen Quali-Lauf und Finale

Der Übergang vom Qualifikations- in den Finalmodus ist ein zweistufiger, manueller Vorgang im Schiedsrichter-Panel (`referee.html`). Jede Startgruppe durchläuft diesen Prozess unabhängig voneinander.

### Phase 1 – Qualifikation

Solange die Qualifikation offen ist, können die Kampfrichter beliebig viele Läufe bewerten. Jede abgegebene Wertung landet als `JuryScore`-Datensatz in der Datenbank mit einer Referenz auf das Event. Pro Starter und Lauf wird ein Satz Scores gespeichert (ein Eintrag je Kampfrichter).

Die Ergebnisanzeige (`results.html`) zeigt für jeden Starter alle absolvierten Läufe einzeln an und hebt den besten Lauf grün hervor.

### Schritt 1 – Qualifikation schließen

Der Schiedsrichter klickt im Panel der jeweiligen Startgruppe auf **„SCHLIESSEN"**.

Was passiert:
- Das Feld `qualiClosed` der `StartGroup` wird auf `true` gesetzt.
- Die Gruppe wird in allen Anzeigen mit einem Schloss-Symbol markiert.
- Neue Jury-Wertungen für diese Gruppe werden ab sofort nicht mehr entgegengenommen.

Der Schritt ist umkehrbar – ein erneuter Klick öffnet die Qualifikation wieder.

### Schritt 2 – Finale erstellen

Sobald `qualiClosed = true`, erscheint im Panel der Schaltfläche **„FINALE"**. Ein Klick darauf ruft die Parse-Cloud-Funktion `createFinal` auf.

Was die Cloud-Funktion tut:

1. **Lädt** alle aktiven Starter der Gruppe (disqualifizierte oder entfernte Starter werden ausgeschlossen).
2. **Aggregiert** alle `JuryScore`-Einträge des Events. Die Scores werden nach Starter und Lauf gruppiert; ein Lauf entspricht einem vollständigen Satz Kampfrichter-Wertungen.
3. **Ermittelt** den besten Lauf je Starter (höchste Gesamtpunktzahl über alle Kampfrichter).
4. **Sortiert** die Starter absteigend nach diesem Bestwert und wählt die besten `bestOf` (Standard: 8) aus.
5. **Löscht** bestehende `FinalEntry`-Einträge dieser Gruppe (damit ein erneutes Ausführen sicher ist).
6. **Erstellt** neue `FinalEntry`-Datensätze – einen je Finalist – mit diesen Feldern:

   | Feld | Inhalt |
   |---|---|
   | `starter` | Pointer auf den Starter |
   | `startGroup` | Pointer auf die Startgruppe |
   | `event` | Pointer auf das Event |
   | `startNumber` | Ursprüngliche Startnummer des Qualifikationslaufs |
   | `qualiScore` | Punktzahl des besten Qualifikationslaufs |
   | `finalStartNumber` | Startreihenfolge im Finale (1 = startet zuerst) |

**Startreihenfolge im Finale:** Der bestplatzierte Qualifikant erhält die höchste `finalStartNumber` und startet damit zuletzt – entsprechend der BMX-Konvention.

### Was sich in den Anzeigen ändert

- **Referee-Panel:** Der Button zeigt nach Abschluss „✓ N Finalisten".
- **Ergebnisanzeige:** Die Gruppe wird mit Schloss-Symbol dargestellt; die `FinalEntry`-Datensätze stehen für die weitere Auswertung bereit.
- **Live-Synchronisation:** Alle verbundenen Clients erhalten die Änderung per WebSocket-Subscription ohne Seitenneuladen.

### Hinweise

- **Kein automatischer Auslöser** – beide Schritte erfordern eine bewusste Aktion des Schiedsrichters.
- **Keine Mindestpunktzahl** – es rücken immer die besten `bestOf` Starter vor, unabhängig vom erzielten Score.
- **Wiederholbar** – „FINALE" kann mehrfach geklickt werden (z. B. nach nachträglicher Disqualifikation). Die bestehenden `FinalEntry`-Einträge werden dabei ersetzt.
- **Gruppenweise** – jede Startgruppe (Kids, Amateur, Pro, Frauen) wird einzeln abgeschlossen; mehrere Gruppen können gleichzeitig in unterschiedlichen Phasen sein.

