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
