# filmio

link: https://davidflasch2009.github.io/filmio/

Deine persönliche Filmliste als installierbare Web-App (PWA).

- **Watchlist** (will ich sehen) und **Gesehen** (mit eigener Bewertung)
- Filmsuche über die **TMDB-API** (Poster, Titel, Jahr, Genres, Handlung, Laufzeit)
- **Bewertung** wird aus **15 Ja/Neutral/Nein-Fragen** berechnet (0,5–5 Sterne)
- **Ein Account** (Name + Passwort): Die Liste wird zwischen allen angemeldeten Geräten abgeglichen (Supabase)
- Jedes Gerät hat die komplette Liste lokal – mit **JSON-Export/Import**
- Offline nutzbar (außer der Suche), gehostet auf **GitHub Pages**

Die vollständige Spezifikation steht in [`Anleitung.md`](Anleitung.md), die Planungsnotizen in [`planning/`](planning/).

## Lokal starten

Voraussetzung: Node.js 20.19+ (oder 22.12+).

```bash
npm install
cp .env.example .env      # dann VITE_TMDB_TOKEN eintragen (TMDB v4 Read Access Token)
npm run dev               # http://localhost:5173/filmio/
```

Weitere Befehle:

| Befehl            | Zweck                                              |
|-------------------|----------------------------------------------------|
| `npm run build`   | Typprüfung + Produktions-Build nach `dist/`        |
| `npm run preview` | Produktions-Build lokal ansehen (inkl. Service Worker) |
| `npm run lint`    | Lint (oxlint)                                      |

> `.env` wird **nie** committet (steht in `.gitignore`).

## Deployment (GitHub Pages)

Der Workflow `.github/workflows/deploy.yml` baut und veröffentlicht die App bei jedem Push auf `main`.

Einmalig einrichten:

1. TMDB-Account → Settings → API → **v4 Read Access Token** holen.
2. Repo → Settings → **Secrets and variables → Actions** → Secret `VITE_TMDB_TOKEN` = der Token.
3. Repo → Settings → **Pages** → Source = **GitHub Actions**.
4. Push auf `main` → die App läuft unter `https://<user>.github.io/filmio/`.

> **Hinweis:** Der Token ist im ausgelieferten Bundle sichtbar. Nur einen **nicht-kommerziellen Wegwerf-Key** verwenden und ihn bei Missbrauch in TMDB neu generieren.

## Account & Abgleich

- Beim ersten Öffnen kommt ein Anmelde-Bildschirm. Gibt es noch keinen Account, wird er dort **einmalig** erstellt;
  danach lehnt der Server jede weitere Registrierung ab (Trigger auf `auth.users`, siehe [`supabase/schema.sql`](supabase/schema.sql)).
- Angemeldet bleibt man, bis man sich unter **Mehr → Abmelden** abmeldet.
- Der Name wird intern zu `name@filmio.invalid` (an diese Adresse kann nie eine Mail gehen).
- Abgleich beim Start, beim Zurückkehren in die App, nach jeder Änderung und jede Minute, solange die App offen ist.
  Pro Film gewinnt die jüngere Änderung (`updatedAt`), Löschungen werden über Lösch-Marker (`deleted`) weitergegeben.
  Speichern auf dem Server klappt nur mit passender Revision – sonst wird neu zusammengeführt.
- Offline funktioniert alles weiter; abgeglichen wird, sobald wieder Internet da ist.
- Projekt-URL und *Publishable Key* stehen in `src/lib/cloud.ts` (öffentlich gedacht; geschützt wird über Anmeldung + Row Level Security).

## Mitteilungen (Web Push)

- Die App meldet das Gerät in `filmio_push` an (Endpoint + Schlüssel + Land), siehe [`supabase/push.sql`](supabase/push.sql).
- Die Edge Function [`supabase/functions/filmio-notify`](supabase/functions/filmio-notify) läuft täglich um 16:17 UTC (pg_cron + pg_net),
  fragt TMDB nach Anbietern und Kinostarts der Watchlist-Filme und verschickt neue Meldungen.
  Beim ersten Lauf wird nur der Stand gemerkt (keine Flut). Abgemeldete Geräte (404/410) werden gelöscht.
- Verschlüsselung (RFC 8291) und VAPID (RFC 8292) ohne Bibliothek in `webpush.ts`.
- Secrets in Supabase: `FILMIO_VAPID_PUBLIC`, `FILMIO_VAPID_PRIVATE_JWK`, `FILMIO_CRON_SECRET` (nicht im Repo).
  Der öffentliche VAPID-Schlüssel steht in `src/lib/push.ts`.
- Auf dem iPhone nur, wenn filmio auf dem Home-Bildschirm liegt (iOS 16.4+).

## Daten & Backup

- Gespeichert wird in `localStorage` unter dem Schlüssel `filmio.v1` (`{ version: 1, films: [...] }`).
- **Mehr → Export** lädt `filmio-backup-YYYY-MM-DD.json` herunter.
- **Mehr → Import** prüft die Datei vollständig; bei Fehlern wird nichts verändert.
  - *Zusammenführen*: gleiche Filme (TMDB-ID) werden überschrieben, neue ergänzt.
  - *Ersetzen*: die komplette Liste wird durch das Backup ersetzt.
- Nicht lesbare Daten im Browser-Speicher werden vor dem Überschreiben unter `filmio.v1.corrupt-backup` gesichert.

## Projektstruktur

```
src/
├─ App.tsx              Tabs, Layout, Detail-/Bewertungs-Ebenen, Nachladen der Szenenbilder
├─ types.ts             Film / Store / Answer
├─ styles.css           Design „Apple TV“ (dunkel, Systemschrift, Gelb als Akzent)
├─ hooks/useOnline.ts   Online-/Offline-Status
├─ lib/
│  ├─ storage.ts        localStorage-CRUD + Export/Import + Validierung (+ Zeitstempel/Lösch-Marker)
│  ├─ cloud.ts          Supabase: Anmeldung (ein Account), Sitzung, Liste laden/speichern
│  ├─ sync.ts           Abgleich zwischen Geräten (Zusammenführen, automatisch)
│  ├─ tmdb.ts           TMDB-Client (de-DE, en-US-Fallback für die Handlung, Poster/Szenenbilder)
│  ├─ scoring.ts        die 15 Fragen + Score-Formel
│  ├─ settings.ts       Darstellung (Kartengröße), gerätebezogen
│  ├─ stars.ts          Füllbreite für halbe Sterne
│  └─ format.ts         Formatierungs-Helfer (Sterne, Datum, Laufzeit)
└─ components/          TabBar, ViewHeader, Views, FilmCard, FilterChip, FilmDetail, RatingFlow (inkl. Sterne-Enthüllung), StarRating, Icons
```

## Funktionen

- **Gesehen / Watchlist / Früher / Suche / Mehr** als Tabs; Gesehen mit Suche, Sortierung, Genre-, Sterne- und „Aus Notizen“-Filter
- **Suche** ohne Begriff = Stöbern wie in einer Streaming-App: Trends, Empfehlungen zu einem Film, der dir gefallen hat, Kino, Genres, Bestbewertet
- **Detailseite**: Szenenbild, Handlung, Notiz, Antwortprofil, *Wo läuft der Film?* (Streaming-Anbieter per TMDB/JustWatch, Land unter Mehr wählbar),
  Regie und Besetzung, Trailer, Filmreihe (mit „Fehlende auf die Watchlist“), ähnliche Filme; vom linken Rand wischen = zurück
- **Watchlist**: Priorität (Fähnchen, steht oben), **„Kommt bald“** für Filme, die im gewählten Land noch nicht erschienen sind
  (Kinostart bzw. digitaler Start laut TMDB, Termine werden alle paar Tage aufgefrischt)
- **Meine Streaming-Dienste** (unter Mehr, auf allen Geräten gleich): Logos auf den Watchlist-Postern, Filter „Läuft bei mir“,
  Hervorhebung auf der Detailseite
- **Würfel** auf der Watchlist, filterbar nach Genre, „Unter 2 Std.“ und „Läuft bei mir“ (ohne Filme, die noch nicht draußen sind)
- **Eigene Listen** (z.B. „Weihnachten“): auf der Detailseite „+ Liste“, Filter „Liste“ in Gesehen und Watchlist,
  Übersicht unter Mehr → Meine Listen (umbenennen, löschen)
- **Jahresrückblick** in der Statistik: Story zum Durchtippen (Filme, Stunden, stärkster Monat, Lieblingsgenre,
  Film des Jahres, Top 5, Lieblingsschauspieler, mehrfach gesehen); zählt nur datierte Filmabende
- **Mitteilungen** (Mehr → Mitteilungen): einmal am Tag, wenn ein Watchlist-Film neu bei deinen Diensten läuft
  oder im gewählten Land ins Kino kommt; Antippen öffnet den Film
- **Mehrfach gesehen**: „Nochmal gesehen“ auf der Detailseite, Daten änderbar; zählt in Statistik und „Zuletzt gesehen“
- **Statistik** unter Mehr: Anzahl, Stunden, Schnitt, Sterne-Verteilung, beste Filme, Lieblingsgenres, Jahrzehnte, häufigste Ja-Antworten

## Design

Dunkel, ruhig, große Bilder – angelehnt an Apple TV. Die App startet in **Gesehen**, die Tabs sind
Gesehen · Watchlist · Suche · Mehr. Die Detailseite zeigt oben ein Szenenbild des Films (TMDB-Backdrop;
für ältere Einträge lädt die App es beim nächsten Start mit Internet nach). Nach der letzten Frage füllen
sich fünf Sterne bis zur berechneten Bewertung, danach wird automatisch gespeichert.

## Attribution

This product uses the TMDB API but is not endorsed or certified by TMDB.
Das TMDB-Logo (`src/assets/tmdb-logo.svg`) stammt aus [Simple Icons](https://simpleicons.org/) (Quelle: offizielle TMDB-Logo-Seite).
