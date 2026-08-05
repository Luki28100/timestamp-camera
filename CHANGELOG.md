# Änderungen

## 1.2.0

- Der Lichtknopf schaltet durch drei Stellungen: aus, Blitz bei Aufnahme, Dauerlicht. Im Blitzmodus
  bleibt die Lampe dunkel, bis ausgelöst wird. Sie geht an, wartet auf die Belichtungsanpassung,
  nimmt auf und geht wieder aus.
- Bei Video bleibt das Licht die ganze Aufnahme an. Ein einmaliges Aufblitzen ergibt dort keinen Sinn.
- Dauerlicht wird nach einem Kamerawechsel wieder eingeschaltet.

## 1.1.5

- Der Blitz wird in der App zuerst über den System-Kameradienst geschaltet. Die Web-Schnittstelle war
  unzuverlässig: Manche WebViews nehmen die Einstellung an und tun dann nichts.
- Diagnose-Ansicht in den Einstellungen, die zeigt, was jede Ebene beim Schalten zurückmeldet.

## 1.1.4

- Nativer Blitz-Fallback über den System-Kameradienst.
- Fehlschläge beim Schalten erzeugen eine Meldung statt stillem Nichtstun.

## 1.1.3

- Die Hardware-Zurücktaste navigiert innerhalb der App zurück, statt sie zu beenden.
- Kamerafähigkeiten werden nachgelesen, sobald der Stream läuft.

## 1.1.2

- Videos hatten in der Galerie eine falsche Längenangabe. Ursache war die sekündliche
  Zwischenspeicherung, die ein fragmentiertes MP4 erzeugt. Jetzt wird beim Stopp eine einzige Datei
  geschrieben.
- Teilen läuft über das native Teilen-Menü. Der Speichern-Knopf erscheint nur noch im Browser, weil
  Aufnahmen in der App ohnehin in der Galerie landen.

## 1.1.1

- Videoaufnahme repariert. H.264 statt VP9, weil VP9 auf Handys selten in Hardware kodiert wird und
  der Encoder bei 1080p so weit zurückfiel, dass praktisch nur ein Frame überlebte.
- Aufnahme aus einer auf 720p begrenzten Kopie, Bitrate an die Auflösung gekoppelt.
- Der Stempel wird nur noch bei Änderung gezeichnet statt in jedem Frame. Behebt auch das Ruckeln der
  Vorschau.

## 1.1.0

- Aufnahmen landen automatisch im Galerie-Album "Zeitstempel-Kamera", abschaltbar.

## 1.0.1

- Eigene Launcher-Icons.

## 1.0

- Erste Fassung: Zeitstempel mit elf Formaten und eigenem Muster, neun Positionen, Schrift, Farbe,
  Kontur, Hintergrundbox, zwei freie Textzeilen, Standort mit optionaler Adressauflösung, Video mit
  mitlaufender Uhr, Galerie, Selbstauslöser, Gitternetz, Frontkamera spiegeln.
