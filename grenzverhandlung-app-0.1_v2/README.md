# Digitale Grenzverhandlung – Prototyp 0.5 (ADP Rinner)

Offline-Web-App (PWA) für die Grenzverhandlung nach § 43 Abs. 6 VermG. Prototyp zur Masterarbeit „Anwendung von E-Geo-Government in der österreichischen Katastervermessung“ (TU Graz), Kapitel 6.5.

## Neu in 0.5

- Unterlagen: Angebot, Einladungen und andere PDFs kommen im Ordner `unterlagen/` des Verhandlungspakets mit und sind in der App über den Knopf „Unterlagen“ oben jederzeit einsehbar. Vor Ort lassen sich weitere PDFs ergänzen; diese gehen beim Export mit.
- Büro-Seite `paket.html` („Paket erstellen“): Kopfdaten, Beteiligte (auch aus Excel einfügen), GFN, Skizze und Unterlagen eintragen bzw. hineinziehen und als ZIP speichern
- Demo enthält eine fiktive Einladung und ein fiktives Angebot
- Protokoll der Kanzlei einlesen: In „Paket erstellen“ das vorbereitete Protokoll (Word-PDF) hineinziehen. Übernommen werden Vermessungsamt, KG, Projekt (GZ), Ort und die Eigentümer aus der Zustimmungserklärung mit EZ, Gst.-Nr. und Anschrift; das PDF selbst kommt als Unterlage mit.
- Alternativ Grundbuchsabfrage: In „Paket erstellen“ die beiden CSV-Dateien (Eigentümer und Grundstücke) gemeinsam hineinziehen. Die Eigentümer werden mit Titel, Anschrift, EZ und Gst.-Nr. übernommen (Zuordnung über KG und EZ), die GFN aus der Grundstücksabfrage als Behelfe vorgeschlagen; GFN-PDFs werden über die Nummer im Dateinamen zugeordnet. Geburtsdaten und Anteile werden nicht übernommen.
- Fotos: Knopf „Fotos“ oben, Aufnahme mit der Kamera des Tablets, Notiz je Foto. Die Fotos gehen beim Export im Ordner `fotos/` ins Büro, nicht ins Protokoll.
- Links zum Kataster des BEV und zu GIS Steiermark im Bereich „Unterlagen“ (brauchen Internet)

## Ablauf mit dem Büro

1. Büro: `paket.html` am PC öffnen, Paket erstellen, ZIP in den Projektordner legen
2. Tablet: ZIP über einen synchronisierten Ordner (OneDrive/Nextcloud), USB oder internen Server holen und in der App importieren. Kein Versand an private Mail-Adressen (DSGVO).
3. Vor Ort: Verhandlung offline führen
4. Export „Alles für die Kanzlei (ZIP)“ zurück in den Projektordner
5. Büro: Papier-Zustimmungen einscannen, Beurkundungssignatur, Upload ins BAIK; danach Verhandlung am Tablet löschen

## Neu in 0.4

- Skizze nur noch freihand: Stift und Radierer, drei Farben, Rückgängig. Ohne Stift zeichnet ein Finger, zwei Finger zoomen. Sobald ein Stift erkannt wird, verschiebt der Finger nur noch.
- Ablauf auf 6 Schritte verkürzt: Eröffnung (mit GFN und Anwesenden), Skizze, Grenzverlauf, Abschluss, Zustimmung, Export
- Verhandlungsleiter DI Gerald Fuxjäger vorbelegt

## Neu in 0.3

- Protokoll-PDF nach der Vorlage der Kanzlei: Briefkopf mit Logo und Tabelle (Vermessungsamt, KG, Seite, Projekt), Texte und Tabellen wie in der Vorlage, Skizze als Beilage
- GFN-Behelfe werden bei der Eröffnung angehakt und stehen dann mit Planverfasser und Geschäftszahl im Protokoll
- Unterschrift mit dem Stift als zusätzliche Option (nur Information): erscheint in der Spalte „Unterschrift“ einer eigenen Ausfertigung
- Teilprotokoll (vorzeitige Zustimmung) aus 0.2 wieder entfernt

## Neu in 0.2

- Oberfläche im Erscheinungsbild der Kanzlei, Übersicht je GZ, Personenkarten, Behelfe-Galerie, Grenzzeichen-Werkzeug in der Skizze

## Ablauf

1. Start: Auswahl der Geschäftszahl, Import eines Verhandlungspakets (ZIP), Demo-Verhandlung
2. Übersicht und Eröffnung (Uhrzeit mit einem Tipp)
3. Eröffnung: Kopfdaten, GFN-Behelfe anhaken, Beteiligte mit Anwesenheit, Identitätsnachweis und Vollmacht
4. Behelfe: GFN-Pläne als PDF, stufenloser Zoom
5. Begehungsskizze: Stift zeichnet, Finger verschiebt und zoomt; Grenzzeichen, Text, Radierer, Rückgängig
6. Grenzverlauf mit Textbausteinen und strittigen Abschnitten
7. Prüfen und sperren: Pflichtangaben nach § 13 VermV 2016, Vorschau, Sperre mit SHA-256-Prüfsumme
8. Zustimmung: je Eigentümer QES mit ID Austria (über pdf.egiz.gv.at), Papier, Stift (nur Information) oder verweigert
9. Export: Protokoll, Ausfertigung mit Stift-Unterschriften und Verhandlungsdaten als ZIP; Löschen vom Gerät

## Verhandlungspaket (ZIP)

```
verhandlung.json
skizze.pdf
behelfe/GFN_1958.pdf
unterlagen/Angebot.pdf
unterlagen/Einladung.pdf
```

`unterlagen` ist optional: Alle PDFs im Ordner `unterlagen/` werden auch ohne Eintrag übernommen (Titel = Dateiname).

`verhandlung.json`:

```json
{
  "gz": "19389",
  "vermessungsamt": "Graz",
  "katastralgemeinde": "63243 Kirchenviertel",
  "gemeinde": "Gratkorn",
  "ort": "Gratkorn, Kapellenweg",
  "datum": "2026-11-25",
  "verhandlungsleiter": "DI Max Muster",
  "kanzlei": "ADP Rinner ZT GmbH, Münzgrabenstraße 4/1, 8010 Graz",
  "gegenstand": "Umwandlung des Grundstücks .626 in den Grenzkataster",
  "skizze": "skizze.pdf",
  "unterlagen": [
    { "titel": "Einladung zur Grenzverhandlung", "datei": "unterlagen/Einladung.pdf" }
  ],
  "behelfe": [
    { "planverfasser": "…", "geschaeftszahl": "GFN 1958", "anmerkung": "Plan aus 1958", "datei": "behelfe/GFN_1958.pdf" },
    { "geschaeftszahl": "GFN 2775/2020/63", "anmerkung": "ohne PDF: steht trotzdem zur Auswahl" }
  ],
  "beteiligte": [
    { "ez": "1012", "gst": ".626", "name": "Johann Steiner", "anschrift": "Kapellenweg 7, 8101 Gratkorn", "rolle": "Eigentümer" },
    { "name": "Ing. Peter Lang", "anschrift": "Gemeindeamt, 8101 Gratkorn", "rolle": "Vertreter", "vertritt": "Marktgemeinde Gratkorn" }
  ]
}
```

`rolle`: `Eigentümer`, `Vertreter` oder `Anwesend (sonstige)`. Keine Telefonnummern oder E-Mail-Adressen aufnehmen (DSGVO, Auskunft BEV). Ein Beispielpaket lässt sich in der App auf der Startseite herunterladen.

## Betrieb

Die App braucht HTTPS (für Offline-Betrieb und Prüfsumme). Alle Dateien dieses Ordners auf einen statischen Webserver legen, z. B. GitHub Pages. Am Android-Tablet die Seite in Chrome öffnen und über das Menü „Zum Startbildschirm hinzufügen“ installieren. Danach läuft sie ohne Netz; nur der Signaturschritt braucht Internet.

Lokal testen: `python3 -m http.server 8000` in diesem Ordner, dann `http://localhost:8000` öffnen.

Daten liegen ausschließlich im Browser-Speicher (IndexedDB) des Geräts.

## Bibliotheken und Schrift

pdf.js 3.11.174 (Apache 2.0), pdf-lib 1.17.1 (MIT), JSZip 3.10.1 (MIT/GPLv3), Schrift Inter (SIL OFL 1.1), alle lokal.

## Grenzen des Prototyps

- Die Signatur läuft über den kostenlosen EGIZ-Dienst ohne Verfügbarkeitsgarantie; Ablauf mit echtem ID-Austria-Konto noch nicht getestet.
- Die Signaturfelder im PDF sind beschriftet, aber keine QR-Platzhalter für den EGIZ-Dienst.
- Kein Abgleich mit Kanzleisoftware; Austausch nur über Dateien.
- Die Stift-Unterschrift ist nur Information (Anforderung A12, „Kann“) und ersetzt weder QES noch Papier.
