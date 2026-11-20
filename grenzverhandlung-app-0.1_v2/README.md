# Digitale Grenzverhandlung – Prototyp 0.1

Offline-Web-App (PWA) für die Grenzverhandlung nach § 43 Abs. 6 VermG. Prototyp zur Masterarbeit „Anwendung von E-Geo-Government in der österreichischen Katastervermessung“ (TU Graz), Kapitel 6.5.

## Funktionen

1. Start: Auswahl der Geschäftszahl, Import eines Verhandlungspakets (ZIP), Demo-Verhandlung mit fiktiven Daten
2. Eröffnung: Kopfdaten, Eröffnungszeit, Beteiligte mit Anwesenheit, Identitätsnachweis (P/A/L) und Vollmacht
3. Behelfe: GFN-Pläne als PDF, stufenloser Zoom (zwei Finger, Mausrad, Tasten)
4. Begehungsskizze: Stift zeichnet, Finger verschiebt und zoomt; Text, Radierer, Rückgängig, Farben
5. Grenzbeschreibung mit Textbausteinen und strittigen Abschnitten
6. Prüfen und sperren: Pflichtfeldprüfung, Vorschau, Sperre mit SHA-256-Prüfsumme
7. Zustimmung: je Eigentümer QES mit ID Austria (über pdf.egiz.gv.at), Papier oder verweigert; Prüfung, dass das signierte PDF den gesperrten Inhalt unverändert enthält
8. Export: Protokoll-PDF (Seiten 1–3 plus Skizze als Beilage), Verhandlungsdaten als JSON, Verlauf, Löschen vom Gerät

## Verhandlungspaket (ZIP)

```
verhandlung.json
skizze.pdf
behelfe/3127-1968.pdf
behelfe/412-1987.pdf
```

`verhandlung.json`:

```json
{
  "gz": "24017-001",
  "vermessungsamt": "Graz",
  "katastralgemeinde": "63107 Algersdorf",
  "ort": "Graz, Algersdorfer Straße",
  "datum": "2026-11-25",
  "verhandlungsleiter": "Ing. Max Muster",
  "kanzlei": "Vermessungskanzlei …",
  "skizze": "skizze.pdf",
  "behelfe": [
    { "planverfasser": "Dipl.-Ing. H. Beispiel", "geschaeftszahl": "3127/1968", "anmerkung": "Teilungsplan", "datei": "behelfe/3127-1968.pdf" }
  ],
  "beteiligte": [
    { "ez": "67", "gst": "259/66", "name": "Anna Berger", "anschrift": "Hauptplatz 3, 8010 Graz", "rolle": "Eigentümer" },
    { "name": "Thomas Huber", "anschrift": "…", "rolle": "Vertreter", "vertritt": "Beispiel Projekt GmbH" }
  ]
}
```

`rolle`: `Eigentümer`, `Vertreter` oder `Anwesend (sonstige)`. Keine Telefonnummern oder E-Mail-Adressen aufnehmen (DSGVO, Auskunft BEV). Ein Beispielpaket lässt sich in der App auf der Startseite herunterladen.

## Betrieb

Die App braucht HTTPS (für Offline-Betrieb und Prüfsumme). Alle Dateien dieses Ordners auf einen statischen Webserver legen, z. B. GitHub Pages. Am Android-Tablet die Seite in Chrome öffnen und über das Menü „Zum Startbildschirm hinzufügen“ installieren. Danach läuft sie ohne Netz; nur der Signaturschritt braucht Internet.

Lokal testen: `python3 -m http.server 8000` in diesem Ordner, dann `http://localhost:8000` öffnen.

Daten liegen ausschließlich im Browser-Speicher (IndexedDB) des Geräts.

## Bibliotheken

pdf.js 3.11.174 (Apache 2.0), pdf-lib 1.17.1 (MIT), JSZip 3.10.1 (MIT/GPLv3), alle lokal in `libs/`.

## Grenzen des Prototyps

- Die Signatur läuft über den kostenlosen EGIZ-Dienst ohne Verfügbarkeitsgarantie; Ablauf mit echtem ID-Austria-Konto noch nicht getestet.
- Die Signaturfelder im PDF sind beschriftet, aber keine QR-Platzhalter für den EGIZ-Dienst.
- Kein Abgleich mit Kanzleisoftware; Austausch nur über Dateien.
- Keine Stift-Unterschrift als Information (Anforderung A12, „Kann“).
