# Orgelplaner

Webanwendung zum Suchen von Kirchenliedern, zum Finden von Ersatzliedern und zum Erstellen von Gottesdienst-Liedplänen mit PDF- und PNG-Export.
Reines HTML, CSS und Vanilla JavaScript. Kein Backend, keine Datenbank, läuft statisch auf GitHub Pages.

## Projektstruktur

```text
orgelplaner/
├── index.html
├── css/style.css
├── js/
│   ├── app.js        Oberfläche, beide Ansichten, Drag-and-drop, Export-Schaltflächen
│   ├── data.js       Laden und Prüfen von lieder.json und config.json
│   ├── search.js     Suche, Kategorien, Ersatzlied-Logik (ohne Oberfläche)
│   ├── plan.js       Plan, sessionStorage, Datenmodell für den Export
│   └── export.js     PDF für Liedplan und Liederliste (jsPDF), PNG (Canvas)
├── data/
│   ├── lieder.json   Gotteslob-Verzeichnis (hier liegt eine kleine Beispieldatei)
│   └── config.json   Repertoire und Regeln
├── fonts/            Courier Prime und Ubuntu Mono (woff2, OFL-Lizenz)
├── vendor/           jspdf.umd.min.js (MIT-Lizenz)
└── README.md
```

## Wichtig vor der ersten Nutzung

`data/lieder.json` enthält das Gotteslob-Verzeichnis. In `data/config.json` steht unter `SpielbareLieder` nur eine Platzhalterliste. Tragen Sie dort Ihre echten Liednummern ein.

## Lokal testen

`fetch()` funktioniert nicht, wenn die Seite per Doppelklick (`file://`) geöffnet wird. Starten Sie einen kleinen Server im Projektordner:

```bash
cd orgelplaner
python3 -m http.server 8000
```

Dann `http://localhost:8000` im Browser öffnen. Alternativ: `npx serve` oder die Erweiterung „Live Server“ in VS Code.

## Auf GitHub Pages veröffentlichen

1. Neues Repository auf GitHub anlegen und den Inhalt des Ordners `orgelplaner/` hochladen (`index.html` liegt im Hauptverzeichnis des Repositorys).
2. Im Repository: **Settings → Pages**.
3. Unter „Build and deployment“ als Quelle **Deploy from a branch** wählen, Branch `main` und Ordner `/ (root)`, speichern.
4. Nach etwa ein bis zwei Minuten ist die Seite unter `https://<benutzername>.github.io/<repository>/` erreichbar.

Alle Pfade sind relativ, die Anwendung funktioniert deshalb auch im Unterverzeichnis eines Projekt-Repositorys.
Wenn Sie `lieder.json` oder `config.json` ändern, lädt der Browser sie beim nächsten Seitenaufruf neu (bei Bedarf Seite mit Strg+F5 neu laden).

## Konfiguration (`data/config.json`)

| Feld | Bedeutung |
|---|---|
| `SpielbareLieder` | Liste der Nummern, die Sie spielen können. `380` und `380.0` sind gleichwertig, Dezimalnummern wie `174.2` sind erlaubt. |
| `Suchradius` | Radius für Ersatzlieder nach Nummer (Standard 20). |

Es gibt keine Kategorien in der Konfiguration. Die liturgischen Stellen sind keine Kategorien und haben keine Zuordnung. Alle Kategorien kommen ausschließlich aus `lieder.json`.

Ein Lied gilt nur als **spielbar**, wenn seine Nummer in `SpielbareLieder` steht, es im Verzeichnis existiert und dort `Lied: true` hat.

## Suchlogik

- **Titel und Nummer:** Ein Feld, Ergebnisse beim Tippen (in der Auswahl und in der Liederliste). Groß-/Kleinschreibung, Umlaute, ß und Satzzeichen werden angeglichen („grosser gott“ findet „Großer Gott, wir loben dich“). Alle eingegebenen Wörter müssen vorkommen, Titel mit passendem Wortanfang stehen oben. Es werden nur spielbare Lieder durchsucht.
- **Nummer ausdrücklich eingeben:** Ist die Nummer nicht spielbar, zeigt die Anwendung den Grund an (nicht im Repertoire, vermutlich kein Lied, unbekannt) und bietet Ersatzlieder an. Das Lied kann trotzdem in den Plan übernommen werden. Dann steht unter „Besondere Hinweise“ automatisch, dass die Nummer nicht spielbar ist. Dieser Hinweis lässt sich nicht versehentlich löschen und erscheint im PDF und im Bild.
- **Kategorie:** Das Feld `Kategorie` ist ein Text. Enthält er Semikolons, wird er an ihnen in einzelne Kategorien getrennt („Ostern; Halleluja“ ergibt „Ostern“ und „Halleluja“), sonst ist der ganze Text eine Kategorie. Leerzeichen werden bereinigt, Doppelte entfallen. Das Dropdown zeigt alle Kategorien, die mindestens ein spielbares Lied haben. Verglichen wird exakt, „Lob“ trifft nie „Lobpreis“.
- **Ersatzlieder:** Zwei getrennte Gruppen. *Nummernumkreis:* spielbare Lieder mit |Nummer − Wunschnummer| ≤ Suchradius, Grenzen eingeschlossen, sortiert nach Abstand, bei Gleichstand nach Nummer. Berechnet wird mit ganzen Zahlen (Nummer × 10000), damit Dezimalnummern exakt bleiben. *Passende Kategorien:* spielbare Lieder, die mindestens eine Kategorie teilen, sortiert nach Zahl der gemeinsamen Kategorien, dann Nähe der Nummer.
- **Nie automatisch vorgeschlagen:** Einträge mit `Lied: false` und Nummern außerhalb des Repertoires.

## Die zwei Ansichten

Oben wechseln Sie zwischen **Liedplan erstellen** und **Liederliste**.

**Liederliste:** Tabelle aller spielbaren Lieder mit Nummer, Titel und Kategorie. Filter nach Titel/Nummer und Kategorie, Sortierung nach Nummer, Titel (A bis Z) oder Kategorie, auf- oder absteigend (Auswahlfeld oder Klick auf die Spaltenüberschrift). „Angezeigte Liste als PDF speichern“ exportiert genau die Liste, die gerade zu sehen ist.

**Liedplan erstellen:**
1. Zuerst die Stellen auswählen, die im Gottesdienst vorkommen (die Reihenfolge bleibt immer fest).
2. Lieder zuordnen: Am Computer ein Lied aus der Liste auf eine Stelle ziehen. Auf allen Geräten: bei der Stelle „Lied wählen“ tippen und dann ein Lied antippen (es wird sofort eingefügt), oder ein Lied antippen und danach die Stelle wählen.
3. „Frei“ bei einer Stelle teilt dem Organisten mit, dass dort beliebig gespielt werden darf. Das erscheint im PDF und im Bild als „Frei (nach Wahl des Organisten)“.
4. **Strophen (freiwillig):** Bei jedem Lied lässt sich eine Strophenangabe eintragen, als Bereich (`1-3`) oder Liste (`1+3+4`), auch gemischt (`1-2 + 4`). Erlaubt sind außerdem Komma, „und“ und „bis“. Die Eingabe wird vereinheitlicht (`1 - 3`, `1 + 3 + 4`) und steht im PDF und im Bild unter dem Titel. Bei einer ungültigen Angabe fragt die Anwendung vor dem Export nach. Wechselt man das Lied, wird die Angabe gelöscht.
5. Mit dem Haken „Auch Lieder suchen, die ich nicht spielen kann“ durchsucht die Auswahl das ganze Verzeichnis. Solche Lieder sind als „nicht spielbar“ markiert und lassen sich trotzdem einfügen. Im Plan erscheint dann automatisch ein Hinweis unter „Besondere Hinweise“.
6. Gibt man eine nicht spielbare Nummer ein, zeigt die Anwendung Ersatzlieder (Nummernumkreis und passende Kategorien). Bei einem nicht spielbaren Lied im Plan gibt es dafür die Schaltfläche „Ersatz vorschlagen“.

Hinweis: Drag-and-drop funktioniert in Browsern am Computer. Auf Smartphones und Tablets nutzen Sie die Antippen-Variante.

## Plan, Sitzung und Export

- Der Plan wird in `sessionStorage` gehalten und nach einem Neuladen der Seite wiederhergestellt, solange der Browser-Tab offen ist. Es gibt keine dauerhafte Speicherung.
- „Plan zurücksetzen“ fragt vorher nach. Die zuletzt gewählte Ansicht bleibt ebenfalls nur für die Sitzung erhalten.
- **PDF:** A4, mehrseitig, mit der eingebauten Courier-Schrift von jsPDF (Text bleibt auswählbar). Zeichen außerhalb von Latin-1 und gängigen Satzzeichen werden als „?“ ausgegeben.
- **PNG:** Wird direkt auf einem Canvas gezeichnet, mit den Schriften Courier Prime und Ubuntu Mono. Die Höhe passt sich dem Inhalt an. Auf Geräten mit begrenztem Speicher wird die Auflösung bei sehr langen Plänen automatisch reduziert.
- Beide Exporte enthalten dieselben Inhalte in derselben Reihenfolge. Deaktivierte Stellen fehlen, außer die Option „Nicht benötigte Stellen im Export mit ‚entfällt‘ anzeigen“ ist gesetzt.

## Bibliotheken und Schriften

- `vendor/jspdf.umd.min.js`: jsPDF 4.2.1 (MIT). Erneuern: `npm i jspdf` und die Datei `node_modules/jspdf/dist/jspdf.umd.min.js` nach `vendor/` kopieren.
- `fonts/`: Latin-Teilmengen von Courier Prime und Ubuntu Mono (SIL Open Font License, Lizenztexte liegen bei). Fehlen die Dateien, greifen die Fallback-Schriften (Times New Roman bzw. Arial) und die Anwendung bleibt lesbar.
- Mehrfach vorkommende Nummern in `lieder.json` meldet die Anwendung als Hinweis. Es wird nur ein Eintrag verwendet, ein Lied hat Vorrang.
- Es werden keine externen Dienste angesprochen.