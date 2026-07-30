# Starterverwaltung – Benutzer einrichten

Damit sich jemand auf der Seite **Starter verwalten** (`starterMaintenance.html`) anmelden kann, muss ein Benutzerkonto im Parse-Backend (Back4App) angelegt werden. Das ist eine einmalige Einrichtung pro Person.

---

## Voraussetzung

Zugang zur Back4App-Konsole des Projekts:
- URL: [https://www.back4app.com](https://www.back4app.com)
- Anmelden mit dem Administrator-Account des Projekts

---

## Schritt-für-Schritt

### 1. Back4App-Konsole öffnen

1. Auf [back4app.com](https://www.back4app.com) einloggen
2. Das Projekt **WeRace** auswählen
3. Im linken Menü auf **Database → Browser** klicken

### 2. Klasse `_User` öffnen

In der Klassen-Liste links die Klasse **`_User`** auswählen.  
Hier sind alle bestehenden Benutzerkonten aufgelistet.

### 3. Neuen Benutzer anlegen

1. Oben links auf **+ Add a row** klicken
2. Folgende Felder ausfüllen:

| Feld       | Beschreibung                              | Beispiel          |
|------------|-------------------------------------------|-------------------|
| `username` | Benutzername für die Anmeldung            | `veranstalter`    |
| `password` | Passwort (wird automatisch gehasht)       | `sicheres-pw-123` |
| `email`    | Optional, aber empfohlen für Passwort-Reset | `org@example.com` |

3. Zeile speichern

> **Hinweis:** Das Passwort wird von Back4App beim Speichern automatisch gehasht – es wird niemals im Klartext gespeichert.

### 4. Anmeldedaten weitergeben

Den Benutzernamen und das Passwort sicher an die zuständige Person weitergeben (z. B. per verschlüsselter Nachricht oder persönlich).

---

## Anmeldung auf der Seite

Die Person öffnet die Starterverwaltung über die Hauptseite (`index.html`) unter **Organisation → Starter verwalten**.

Beim ersten Aufruf erscheint ein Anmeldeformular. Nach erfolgreicher Anmeldung ist die Seite vollständig nutzbar – einschließlich Anlegen, Bearbeiten und Löschen von Startern.

Mit dem Button **Abmelden** (oben rechts im Header) wird die Sitzung beendet und das Anmeldeformular erscheint erneut.

---

## Benutzer löschen oder Passwort ändern

Beides erfolgt ebenfalls in der Back4App-Konsole unter **Database → Browser → `_User`**:

- **Passwort ändern:** Zeile des Benutzers anklicken → Feld `password` bearbeiten → speichern (wird erneut gehasht)
- **Benutzer löschen:** Zeile markieren → **Delete row**

---

## Sicherheitshinweis

Die Seite `starterMaintenance.html` ist über die URL direkt erreichbar. Ohne gültige Anmeldung können keine Daten verändert werden – das Lesen der Daten (Starter-Liste) ist jedoch ebenfalls erst nach Login möglich, da die Seite die Daten erst nach erfolgreicher Anmeldung lädt.
