# WeRace – Open Issues

## Alle Issues behoben ✅

| ID | Datei | Problem | Status |
|---|---|---|---|
| B1 | `starter.html` | `scoreWs` hatte keinen Reconnect-Handler — Operator hing permanent im Wartezustand | ✅ Behoben |
| B2 | `parse-api.js`, `jury.html` | Nach Reconnect wurde HT_ACTIVESTARTER nicht nachgeladen — Kampfrichter sah keine Startnummer | ✅ Behoben |
| B3 | `starter.html` | Uhr-Drift zwischen Client und Server filterte gültige Scores heraus — „Nächster Starter" erschien nie | ✅ Behoben |
| D1 | `parse-api.js`, `cloudcode-heldentag.js` | Race Condition bei zwei gleichzeitigen Operatoren: `publishActiveStarter` war nicht-atomar | ✅ Behoben |
| D2 | `jury.html` | TOCTOU: Score ging an falschen Starter wenn Operator „Nächster Starter" klickte während Kampfrichter-Modal offen war | ✅ Behoben |
| D3 | `cloudcode-heldentag.js`, `starter.html` | `createFinal` Race Condition: doppelter Aufruf erzeugte doppelte FinalEntry-Records | ✅ Behoben |
| D4 | `starter.html` | „Finale vorzeitig starten" war klickbar während ein Starter auf der Fläche war | ✅ Behoben |
| D5 | `starter.html` | Kriterien-Key-Änderung während laufendem Event ohne Warnung — Kampfrichter-Apps verwendeten veraltete Keys | ✅ Behoben |
| D6 | `config.js` | Phantom-Presence nach Tab-Absturz — ausgefallener Kampfrichter erschien bis zu 90s als online | ✅ Behoben |
