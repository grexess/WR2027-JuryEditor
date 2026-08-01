# WeRace – Berechtigungskonzept (Parse Server)

## Überblick

Die Zugriffskontrolle basiert auf zwei Mechanismen:

| Mechanismus                     | Wo eingesetzt                                        |
| ------------------------------- | ---------------------------------------------------- |
| **Parse User + Session Token**  | `index.html`, `starter.html`, `starterMaintenance.html` |
| **HT_USERROLE** (eigene Klasse) | Verknüpfung User ↔ Event                            |
| **Judge Token** (URL-Parameter) | Kampfrichter-Seite (`jury.html`)                     |
| **Offen**                       | `results.html`                                       |

Ein eingeloggter User darf alle Seiten öffnen, für deren Event ein `HT_USERROLE`-Datensatz mit seiner `objectId` existiert. Die Judge-Token für `jury.html` kann nur ein solcher Event-User über die Übersichtsseite einsehen und weitergeben.

---

## Klasse `HT_USERROLE`

Pro User und Event gibt es genau **einen** Datensatz:

| Feld    | Typ                | Beschreibung                                         |
| ------- | ------------------ | ---------------------------------------------------- |
| `user`  | Pointer `_User`    | Der berechtigte Benutzer                             |
| `event` | Pointer `HT_EVENT` | Das Event, für das die Berechtigung gilt             |
| ACL     | —                  | Read: nur der jeweilige User / Write: nur Master Key |

Die ACL ist der Sicherheitsmechanismus: Parse liefert den Datensatz nur dem User zurück, dessen Session Token in der ACL steht. Kein Ergebnis = kein Zugriff.

---

## Schema anlegen per REST API

```bash
curl -X POST \
  -H "X-Parse-Application-Id: <APP_ID>" \
  -H "X-Parse-Master-Key: <MASTER_KEY>" \
  -H "Content-Type: application/json" \
  -d '{
    "className": "HT_USERROLE",
    "fields": {
      "user":  { "type": "Pointer", "targetClass": "_User",    "required": true },
      "event": { "type": "Pointer", "targetClass": "HT_EVENT", "required": true }
    },
    "indexes": {
      "user_event": { "user": 1, "event": 1 }
    },
    "classLevelPermissions": {
      "find":     { "requiresAuthentication": true },
      "get":      { "requiresAuthentication": true },
      "create":   { "*": false },
      "update":   { "*": false },
      "delete":   { "*": false },
      "addField": { "*": false },
      "protectedFields": { "*": [] }
    }
  }' \
  https://parseapi.back4app.com/schemas/HT_USERROLE
```

---

## User anlegen per REST API

```bash
curl -X POST \
  -H "X-Parse-Application-Id: <APP_ID>" \
  -H "X-Parse-Master-Key: <MASTER_KEY>" \
  -H "Content-Type: application/json" \
  -d '{
    "username": "<BENUTZERNAME>",
    "password": "<PASSWORT>"
  }' \
  https://parseapi.back4app.com/users
```

Die Antwort enthält die `objectId` des neuen Users:

```json
{ "objectId": "<USER_OBJECT_ID>", "createdAt": "..." }
```

---

## Berechtigungseintrag anlegen per REST API

```bash
curl -X POST \
  -H "X-Parse-Application-Id: <APP_ID>" \
  -H "X-Parse-Master-Key: <MASTER_KEY>" \
  -H "Content-Type: application/json" \
  -d '{
    "user":  { "__type": "Pointer", "className": "_User",    "objectId": "<USER_OBJECT_ID>" },
    "event": { "__type": "Pointer", "className": "HT_EVENT", "objectId": "<EVENT_OBJECT_ID>" },
    "ACL": {
      "<USER_OBJECT_ID>": { "read": true, "write": false }
    }
  }' \
  https://parseapi.back4app.com/classes/HT_USERROLE
```

Ein User kann für mehrere Events berechtigt sein — jeweils ein eigener Datensatz pro Event.

---

## Technische Funktionsweise (`checkEventAccess`)

`ParseAPI.checkEventAccess(eventObjectId)` in `parse-api.js`:

```
GET /classes/HT_USERROLE?where={"event":{...ptr...}}&limit=1
Header: X-Parse-Session-Token: <session-token>
```

Parse wendet die ACL an und gibt nur Datensätze zurück, auf die der Session-User Lesezugriff hat. Leeres Ergebnis → Zugriff verweigert.

---

## Ablauf beim Seitenaufruf

```
Benutzer öffnet index.html / starter.html / starterMaintenance.html
        │
        ▼
Session-Token in localStorage vorhanden?
   Ja ──► checkEventAccess(eventObjectId)
              ├── Datensatz gefunden ──► Seite wird geladen
              └── kein Datensatz   ──► Login-Overlay + Fehlermeldung
   Nein ──► Login-Overlay anzeigen
              │
              ▼
         Benutzer gibt Credentials ein
              │
              ▼
         ParseAPI.login() → Session Token
              │
              ▼
         checkEventAccess() → Datensatz gefunden / nicht gefunden
```

> Hinweis: `index.html` führt nach dem Login **keine** `checkEventAccess`-Prüfung durch — der Login selbst ist ausreichend. Die Event-Zuordnung wird erst relevant, wenn der User eine Unterseite öffnet.

---

## Zusammenfassung: Wer braucht was

| Person                | Seite                     | Benötigt                                      |
| --------------------- | ------------------------- | --------------------------------------------- |
| Veranstalter / Admin  | `index.html`              | Parse User (Login)                            |
| Startbereich-Operator | `starter.html`            | Parse User + `HT_USERROLE` für das Event      |
| Starter-Verwalter     | `starterMaintenance.html` | Parse User + `HT_USERROLE` für das Event      |
| Kampfrichter          | `jury.html`               | Judge Token (URL-Parameter)                   |
| Zuschauer             | `results.html`            | Nichts (öffentlich)                           |
