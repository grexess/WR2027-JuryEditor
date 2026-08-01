# WeRace – Ablaufhandbuch

## Vorbereitung

Vor dem Event werden alle Starter mit Startnummer, Name und Startgruppe in der **Starter-Verwaltung** erfasst. Anschliessend werden die Event-Einstellungen festgelegt: Anzahl Qualifikationsläufe, Anzahl Finalläufe, wie viele Starter ins Finale einziehen und nach welchem Modus die Quali-Platzierung berechnet wird (Summe aller Läufe oder bester Lauf).

---

## Qualifikation

### Normaler Ablauf

Der Startbereich-Operator wählt einen Starter aus der Liste aus und bestätigt den Start. Die Kampfrichter werten den Lauf auf ihren Tablets. Sobald alle Wertungen eingegangen sind, erscheint der Button **Nächster Starter** – erst dann wird der nächste Starter freigegeben.

Sobald alle Starter einer Gruppe die erforderliche Anzahl Qualifikationsläufe absolviert haben, erscheint automatisch ein Dialog zur Finalistenermittlung. Nach Bestätigung werden die besten Starter ermittelt und das Finale vorbereitet.

### Was passiert, wenn ein Starter entfernt wird?

Ein entfernter Starter wird im Startbereich mit dem Badge **Entfernt** markiert und kann nicht mehr gestartet werden. Er wird bei der automatischen Erkennung „alle Starter fertig" nicht mitgezählt – die Gruppe kann also auch ohne ihn ins Finale wechseln. Bei der Finalistenermittlung wird er vollständig ignoriert. In der Ergebnisliste erscheint er in einer separaten Sektion am Ende.

### Was passiert, wenn ein Starter disqualifiziert wird?

Ein disqualifizierter Starter erscheint im Startbereich mit dem Badge **DSQ** und kann nicht mehr gestartet werden. Er wird weder bei der „alle fertig"-Erkennung noch bei der Finalistenermittlung berücksichtigt. In der Ergebnisliste erscheint er in einer separaten DSQ-Sektion.

### Was passiert, wenn ein Starter gelöscht wird, während er gerade auf der Strecke ist?

Das System verhindert dies aktiv. Wenn versucht wird, einen Starter in der Starter-Verwaltung zu löschen, während er gerade auf der Strecke läuft, erscheint eine Fehlermeldung:

> *„[Name] läuft gerade – bitte erst den Lauf abschliessen."*

Der Löschvorgang wird blockiert, bis der aktive Lauf auf der Startbereich-App abgeschlossen wurde.



Ein Lauf kann im Verwaltungs-Drawer rückgängig gemacht werden, solange noch kein Finale für die Gruppe läuft. Dabei werden alle Kampfrichterwertungen dieses Laufs gelöscht. Der Starter erscheint danach wieder in der Startliste und kann erneut gestartet werden. War die Gruppe bereits als „Quali abgeschlossen" markiert, wird dieser Status automatisch zurückgesetzt.

---

## Finale

### Was passiert, wenn ein Finalist während des Finals entfernt oder disqualifiziert wird?

Der Finalist wird im Finale-Picker sofort mit dem Badge **DSQ** bzw. **Entfernt** markiert und kann nicht mehr gestartet werden. Er bleibt in der Finalistenliste sichtbar, damit die Startreihenfolge der übrigen Finalisten erhalten bleibt. In der Ergebnisliste erscheint er wie bei der Qualifikation in der entsprechenden Sondersektion.



Sobald die Finalistenermittlung abgeschlossen ist, erscheint im Startbereich der Umschalter **Qualifikation / Finale**. Im Finale-Modus zeigt die Startliste nur noch die ermittelten Finalisten in ihrer Startreihenfolge. Der beste Qualifikant startet zuletzt.

Der Ablauf im Finale ist identisch zur Qualifikation: Starter auswählen, starten, warten bis alle Kampfrichterwertungen eingegangen sind, dann weiter zum nächsten Starter.

---

## Vorzeitiger Abbruch der Qualifikation

Wenn die Qualifikation einer Gruppe manuell beendet werden soll (z.B. bei Zeitdruck oder Ausfall von Startern), kann im Verwaltungs-Drawer die Quali der Gruppe manuell geschlossen werden. Die Finalistenermittlung berücksichtigt dann nur die bis dahin absolvierten Läufe.

---

## Ergebnisse

Die Ergebnisseite unter `results.html` ist für alle Zuschauer öffentlich zugänglich – per QR-Code oder direktem Link. Die Liste aktualisiert sich automatisch nach jeder Wertung. Oben kann zwischen Qualifikation und Finale gewechselt werden.

Disqualifizierte und entfernte Starter erscheinen nicht in der Hauptrangliste, sondern in separaten aufklappbaren Sektionen am Ende der Seite.
