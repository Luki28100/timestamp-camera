# Zeitstempel-Kamera

Android-App, die Datum, Uhrzeit, Standort und eigenen Text **fest ins Bild einbrennt**. Nicht als
Metadaten, sondern als sichtbaren Stempel, der auch nach dem Weiterleiten oder Ausdrucken erhalten
bleibt. Für Fotos und Videos.

Vorschau, Foto und Video laufen durch **denselben Zeichenpfad**. Was im Sucher steht, steht exakt so
in der Datei. Bei Videos wird der Stempel in jeden Frame geschrieben, die Uhr läuft im Clip also
sichtbar mit.

Kostenlos, ohne Werbung, ohne Konto, ohne Server.

## Entstehung

Diese App wurde mit Hilfe von KI entwickelt. Der Quelltext stammt zum überwiegenden Teil von Claude
(Anthropic). Anforderungen, Entscheidungen über Aufbau und Funktionsumfang sowie die Tests auf echter
Hardware kommen vom Autor.

## Installieren

Die fertige APK liegt unter [Releases](../../releases/latest). Herunterladen, antippen und die
Installation aus unbekannter Quelle einmalig erlauben. Eine ausführliche Anleitung für Nutzer steht
in [INSTALLATION.md](INSTALLATION.md).

## Funktionen

- **Zeitstempel** in elf Formatvorlagen oder nach eigenem Muster (`YYYY`, `MM`, `DD`, `dddd`,
  `HH:mm:ss`, `A`, `Z`; Text in `[eckigen Klammern]` bleibt wörtlich). Wochentag und Zeitzone
  zuschaltbar.
- **Taktische Zeit** aus dem BOS-Umfeld: nur Tag, Stunde, Minute als `311405`, wahlweise mit Monat
  und Jahr. Die NATO-Form mit Zonenbuchstabe gibt es zusätzlich als DTG (`311405A DEC 25`). Dafür
  drei weitere Muster-Zeichen: `MON` für den Monat als `JAN`…`DEC`, `X` für den NATO-Zonenbuchstaben
  (A = UTC+1, B = UTC+2, Z = UTC, J für Halbstunden-Zonen) und ein führendes `!`, das das gesamte
  Muster auf UTC umrechnet.
- **Darstellung**: neun Positionen, Schriftgröße und Randabstand relativ zur Bildhöhe, damit der
  Stempel auf 720p und 4K gleich aussieht. Vier Schriftarten, Farbe, schwarze Kontur, Schlagschatten,
  Hintergrundbox mit Deckkraft.
- **Zwei freie Textzeilen**, etwa Projekt und Auftragsnummer.
- **Standort** als Koordinaten dezimal oder in Grad, Minuten, Sekunden, dazu Höhe und Genauigkeit.
  Adressauflösung ist möglich und standardmäßig aus.
- **Video** mit mitlaufender Uhr und Ton.
- **Blitz** in drei Stellungen: aus, bei Aufnahme, Dauerlicht.
- **Aufnahmen** landen im Galerie-Album „Zeitstempel-Kamera“, abschaltbar.
- Selbstauslöser, Gitternetz, Frontkamera spiegeln.

Einstellungen liegen im `localStorage`, Aufnahmen zusätzlich in IndexedDB auf dem Gerät.

## Datenschutz

Die App hat keinen Server. Bilder, Videos und Einstellungen verlassen das Gerät nicht. Es gibt kein
Konto, keine Anmeldung, keine Werbung und keine Analyse- oder Absturzberichte.

Einzige Ausnahme ist die optionale **Adressauflösung**. Ist sie eingeschaltet, gehen die Koordinaten
an Nominatim von OpenStreetMap. Sie ist standardmäßig aus, verlangt beim ersten Einschalten eine
ausdrückliche Bestätigung, ist auf eine Anfrage pro Sekunde und 50 Meter Ortsveränderung gedrosselt
und fällt bei Fehlern still auf reine Koordinaten zurück.

Vollständige Fassung: [Datenschutzerklärung](docs/datenschutz.html).

## Aus dem Quelltext bauen

Voraussetzungen: Node.js 20 oder neuer. Für die APK zusätzlich JDK 21 und das Android SDK
(Plattform 34, Build-Tools 34.0.0, Platform-Tools) mit gesetztem `JAVA_HOME` und `ANDROID_HOME`.

```bash
npm install
npm run dev          # Entwicklungsserver auf http://localhost:4176
npm run build        # Typecheck und Produktionsbuild nach dist/
npm run typecheck
npm run icons        # erzeugt PWA- und Launcher-Icons neu
```

Für die APK:

```bash
npm run cap:sync
cd android && gradlew.bat assembleRelease
```

Zwei Dateien fehlen nach dem Klonen absichtlich, weil sie nicht ins Repository gehören:

- `android/local.properties` mit `sdk.dir=` und dem Pfad zum lokalen Android SDK.
- `keystore/timestamp-camera.jks` und `android/keystore.properties` mit einem Signaturschlüssel. Ohne
  sie entsteht ein unsignierter Release-Build. Wer selbst signieren will, legt einen eigenen
  Schlüssel mit `keytool` an und trägt Pfad, Alias und Passwörter in `keystore.properties` ein.

Das Build-Verzeichnis liegt bewusst außerhalb des Projektordners, weil synchronisierte Ordner
(OneDrive und Ähnliche) Dateien in Cloud-Platzhalter verwandeln, an denen Gradle scheitert. Über die
Umgebungsvariable `TIMESTAMP_CAMERA_BUILD_DIR` lässt sich der Ort ändern.

## Als Web-App statt als APK

Das Projekt ist im Kern eine PWA und läuft auch im Browser. `getUserMedia` verlangt dabei einen
*secure context*: `localhost` funktioniert, eine einfache LAN-Adresse nicht. Ohne HTTPS startet
automatisch ein Demobild statt der Kamera. Für die Nutzung am Handy braucht es also entweder ein
gültiges Zertifikat oder die APK, in deren WebView der Ursprung als sicher gilt.

## Technik

Vite, React 18, TypeScript und Tailwind, verpackt mit Capacitor 6. Der Stempel wird auf ein Canvas
gezeichnet, das gleichzeitig Vorschau, Fotoquelle und Videoquelle ist. Aufgenommen wird über
`MediaRecorder` von einer auf 720p begrenzten Kopie, mit H.264, weil Handys das in Hardware kodieren.

## Bekannte Grenzen

- **Der Zeitstempel ist kein forensischer Beweis.** Er stammt aus der Uhr des Geräts. Wer die
  Systemzeit verstellt, bekommt einen falschen Stempel ins Bild.
- **Videoformat**: bevorzugt MP4 mit H.264, sonst WebM. Kann ein Browser beides nicht, wird der
  Video-Modus deaktiviert statt zu scheitern.
- **Ton**: Das Mikrofon wird erst beim Start der Aufnahme angefragt. Wird es abgelehnt, entsteht ein
  Video ohne Ton statt gar keinem.
- **Im Hintergrund**: Läuft die App nicht im Vordergrund, drosselt das System den Zeichentakt. Ein
  Watchdog hält Bild und Uhr weiter am Laufen, aber mit deutlich weniger Bildern pro Sekunde.
- **Demobild**: Gibt es keine Kamera oder wird sie abgelehnt, zeigt die App ein bewegtes Testbild mit
  Hinweis, statt nur eine Fehlermeldung anzuzeigen.

## Lizenz

[MIT](LICENSE)
