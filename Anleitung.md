# filmio – Vollständige Build-Anleitung

> **Zweck:** Diese Anleitung ist so vollständig, dass eine KI die App **in einem Durchlauf** bauen kann, ohne nachzufragen. Alle Entscheidungen sind getroffen; die Detail-Begründungen liegen in `planning/`.

---

## 0. Was gebaut wird

**filmio** – eine Single-User **PWA** zum Tracken von Filmen:

- **Watchlist** (will ich sehen) und **Gesehen** (mit eigener Bewertung).
- Filme werden über die **TMDB-API** gesucht (Poster, Titel, Jahr, Genres, Overview, Laufzeit).
- **Bewertung** wird nicht manuell gesetzt, sondern aus **15 Ja/Neutral/Nein-Fragen** berechnet.
- Daten liegen **nur lokal** im Browser (kein Backend, kein Login), mit **JSON-Export/Import**.
- Gehostet auf **GitHub Pages**, installierbar als App, offline nutzbar (außer der Suche).
- **Visuelles Design kommt später** → funktionales, schlichtes UI genügt.

---

## 1. Tech-Stack & Setup

- **React 18 + Vite + TypeScript**
- **`vite-plugin-pwa`** (Service Worker + Manifest)
- **Kein Router** – Views werden über State umgeschaltet (vermeidet GitHub-Pages-404-Probleme)
- Keine weiteren schweren Abhängigkeiten nötig.

```bash
npm create vite@latest filmio -- --template react-ts
cd filmio
npm install
npm install -D vite-plugin-pwa
```

---

## 2. Projektstruktur

```
filmio/
├─ .github/workflows/deploy.yml
├─ public/
│  └─ icons/              # Platzhalter-Icons (192, 512, 512-maskable)
├─ src/
│  ├─ main.tsx
│  ├─ App.tsx             # Tab-State + Layout + Tab-Bar
│  ├─ types.ts
│  ├─ lib/
│  │  ├─ storage.ts       # localStorage-CRUD + Export/Import
│  │  ├─ tmdb.ts          # TMDB-Client
│  │  └─ scoring.ts       # 15 Fragen + Score-Formel
│  └─ components/
│     ├─ TabBar.tsx
│     ├─ SearchView.tsx
│     ├─ WatchedView.tsx
│     ├─ WatchlistView.tsx
│     ├─ MoreView.tsx
│     ├─ FilmCard.tsx
│     ├─ FilmDetail.tsx
│     ├─ RatingFlow.tsx
│     └─ StarRating.tsx
├─ index.html
├─ vite.config.ts
├─ .env.example
├─ .gitignore
├─ package.json
└─ README.md
```

---

## 3. Konfiguration

### `vite.config.ts`

```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: '/filmio/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/*.png'],
      manifest: {
        name: 'filmio',
        short_name: 'filmio',
        description: 'Deine persönliche Filmliste',
        theme_color: '#111111',
        background_color: '#111111',
        display: 'standalone',
        start_url: '/filmio/',
        scope: '/filmio/',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      workbox: {
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/image\.tmdb\.org\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'tmdb-posters',
              expiration: { maxEntries: 500, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] }
            }
          }
        ]
      }
    })
  ]
})
```

### `.env.example`
```
VITE_TMDB_TOKEN=
```
> Lokal `.env` anlegen mit dem eigenen TMDB **v4 Read Access Token**. **`.env` niemals committen.**

### `.gitignore` (ergänzen)
```
node_modules
dist
.env
```

---

## 4. Datenmodell – `src/types.ts`

```ts
export type Answer = "ja" | "neutral" | "nein"
export type Status = "watched" | "watchlist"

export interface Film {
  tmdbId: number
  title: string
  year: number | null
  posterPath: string | null       // z.B. "/abc.jpg"
  genres: string[]
  overview: string                // lokal gecached → offline sichtbar
  runtime: number | null
  status: Status
  rating: number | null           // 0.5–5.0, nur bei "watched"
  answers: Answer[] | null        // Länge 15, Reihenfolge = QUESTIONS
  note: string
  addedAt: string                 // ISO-Datum
  watchedAt: string | null        // ISO-Datum, wenn als gesehen markiert
}

export interface Store {
  version: 1
  films: Film[]
}
```

---

## 5. Persistenz & Export/Import – `src/lib/storage.ts`

- Konstante `STORAGE_KEY = "filmio.v1"`.
- `load(): Store` – liest aus `localStorage`, Fallback `{ version: 1, films: [] }`. Defekte/leere Daten sauber abfangen.
- `save(store: Store): void`.
- CRUD-Helfer: `addFilm`, `updateFilm(tmdbId, patch)`, `removeFilm(tmdbId)`, `getByStatus(status)`. Eindeutigkeit über `tmdbId`.
- **Export:** `exportJson()` – serialisiert den `Store` und löst einen Datei-Download aus: Name `filmio-backup-YYYY-MM-DD.json` (via `Blob` + temporärem `<a download>`).
- **Import:** `importJson(file: File, mode: "merge" | "replace")`
  - Datei parsen + **validieren** (`version === 1`, `films` ist Array mit plausibler Shape). Bei Fehler: verständliche Fehlermeldung, nichts überschreiben.
  - `"replace"`: kompletten Store ersetzen.
  - `"merge"` (Default): nach `tmdbId` zusammenführen, vorhandene Einträge mit den importierten überschreiben, neue anhängen.

---

## 6. TMDB-Integration – `src/lib/tmdb.ts`

Auth: **v4 Read Access Token** aus `VITE_TMDB_TOKEN`, als Bearer-Header. CORS erlaubt direkte Browser-Requests.

```ts
const BASE = "https://api.themoviedb.org/3"
const IMG = "https://image.tmdb.org/t/p"
const headers = {
  Authorization: `Bearer ${import.meta.env.VITE_TMDB_TOKEN}`,
  accept: "application/json",
}

export async function searchMovies(query: string) {
  const url = `${BASE}/search/movie?query=${encodeURIComponent(query)}&language=de-DE&include_adult=false`
  const res = await fetch(url, { headers })
  if (!res.ok) throw new Error(`TMDB ${res.status}`)
  return (await res.json()).results as TmdbSearchResult[]
}

export async function getMovie(id: number) {
  const res = await fetch(`${BASE}/movie/${id}?language=de-DE`, { headers })
  if (!res.ok) throw new Error(`TMDB ${res.status}`)
  return await res.json() as TmdbMovieDetails
}

export function posterUrl(path: string | null, size: "w185" | "w342" | "w500" = "w342") {
  return path ? `${IMG}/${size}${path}` : null
}
```

- **Sprache `de-DE`**. Fallback: ist die deutsche `overview` leer, denselben Film mit `language=en-US` nachladen und die englische Overview verwenden.
- Beim Hinzufügen eines Films werden die relevanten Felder in den `Film` **gecached** (title, year aus `release_date`, posterPath, genres [aus Details `genres[].name`], overview, runtime), damit die Liste offline komplett funktioniert.
- Poster-Größen: Listen-Thumbs `w185`, Detail `w342`–`w500`.

---

## 7. Bewertung – `src/lib/scoring.ts`

```ts
import { Answer } from "../types"

export const QUESTIONS: string[] = [
  "Ist die Zeit verflogen?",
  "Hat er dich durchgehend gehalten (nie abgeschweift)?",
  "Warst du ganz drin, die Welt um dich vergessen?",
  "Mit den Figuren mitgefiebert?",
  "Emotional gepackt (gelacht/geweint/gezittert)?",
  "Ein Wow-Moment, der hängenbleibt?",
  "Hat er dich nach dem Abspann noch beschäftigt?",
  "War er besser als erwartet?",
  "Hat er dir echt was gegeben (Gedanke/Erlebnis)?",
  "Hättest du sofort weitergeschaut?",
  "War die Optik ein Highlight?",
  "Hat Ton/Musik dich reingezogen?",
  "War das Ende wirklich befriedigend?",
  "Jemandem aktiv ans Herz legen?",
  "Nochmal schauen?",
]

// Ja = 1, Neutral = 0.5, Nein = 0.
// Sterne = runde( Punkte / 15 * 5 auf nächste 0.5 ), min 0.5, max 5.0
export function scoreFromAnswers(answers: Answer[]): number {
  const points = answers.reduce(
    (s, a) => s + (a === "ja" ? 1 : a === "neutral" ? 0.5 : 0), 0)
  const raw = (points / QUESTIONS.length) * 5
  return Math.min(5, Math.max(0.5, Math.round(raw * 2) / 2))
}
```

**Designprinzip (wichtig, nicht verändern):** Die Fragen sind **Bauchgefühl-Fragen** (schnell, ohne Analyse) und enthalten bewusst mehrere **„Sieb"-Fragen** (Nr. 6–10), die nur richtig gute Filme mit „Ja" beantworten – das verhindert, dass alles 5/5 wird. Die Einzelantworten (`answers`) werden pro Film gespeichert, damit die Formel später angepasst und rückwirkend neu berechnet werden kann.

---

## 8. Views & Navigation

`App.tsx` hält den aktiven Tab im State und rendert darunter die Tab-Bar. **Mobile-first**, Tab-Bar unten mit 4 Einträgen:

1. **Suche** (`SearchView`): Suchfeld → `searchMovies` → Trefferliste (`FilmCard` mit Poster/Titel/Jahr). Je Treffer Buttons **„＋ Watchlist"** und **„✓ Gesehen"** (Letzteres öffnet `RatingFlow`). Bereits gespeicherte Filme sind markiert.
2. **Gesehen** (`WatchedView`): alle Filme mit `status="watched"`, als Karten mit Sternen. **Sortieren** (Bewertung ↓/↑, hinzugefügt am, Titel), **Filtern**, **Suchfeld** über die eigene Liste.
3. **Watchlist** (`WatchlistView`): alle `status="watchlist"`; je Film Button **„Als gesehen markieren"** → `RatingFlow`.
4. **Mehr** (`MoreView`): Buttons **Export** / **Import** (mit Merge/Ersetzen-Auswahl), Abschnitt **Über** mit TMDB-Attribution (siehe §11).

**`FilmDetail`** (Film antippen): Poster, Titel, Jahr, Genres, Runtime, Overview. Bei `watched`: `StarRating` + Antwortprofil (welche Fragen Ja/Neutral/Nein) + editierbare **Notiz**. Aktionen: **Bewerten / Neu bewerten** (`RatingFlow`), **Auf Gesehen schieben**, **Löschen**.

---

## 9. Bewertungs-Flow – `src/components/RatingFlow.tsx`

- Zeigt **eine Frage pro Screen** aus `QUESTIONS`, mit drei großen Buttons **Ja / Neutral / Nein**.
- Tipp auf einen Button speichert die Antwort und springt **automatisch zur nächsten Frage** (kleiner Fortschritt „Frage 4/15", Zurück-Button erlaubt).
- Nach Frage 15: `scoreFromAnswers` berechnen, **Sterne anzeigen**, optionales **Notizfeld**, dann **Speichern** → Film auf `status="watched"` setzen, `rating`, `answers`, `watchedAt = heute`.

---

## 10. PWA & Offline

- Service Worker + Manifest über `vite-plugin-pwa` (siehe §3).
- **Offline:** eigene Liste (localStorage) + gecachte Poster funktionieren offline. Die **Suche** braucht Netz → wenn `navigator.onLine === false`, im Such-Tab einen Hinweis „Offline – Suche braucht Internet" zeigen.
- **Icons:** Platzhalter-PNGs in `public/icons/` (einfarbig mit „f" reicht), werden in der Design-Phase ersetzt.

---

## 11. Deployment – GitHub Pages

### `.github/workflows/deploy.yml`

```yaml
name: Deploy to GitHub Pages
on:
  push:
    branches: [main]
permissions:
  contents: read
  pages: write
  id-token: write
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci
      - run: npm run build
        env:
          VITE_TMDB_TOKEN: ${{ secrets.VITE_TMDB_TOKEN }}
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist
  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

### Einmalige Schritte (für David)
1. Repo **`filmio`** (public) anlegen, Code pushen.
2. TMDB-Account → Settings → API → **v4 Read Access Token** holen.
3. Repo → Settings → **Secrets and variables → Actions** → Secret `VITE_TMDB_TOKEN` = der Token.
4. Repo → Settings → **Pages** → Source = **GitHub Actions**.
5. Push auf `main` → App läuft unter `https://<user>.github.io/filmio/`.

> Hinweis: Der Token ist im ausgelieferten Bundle sichtbar. Nur einen **nicht-kommerziellen Wegwerf-Key** nehmen; bei Missbrauch in TMDB neu generieren.

---

## 12. Styling

Nur **funktional & schlicht** (lesbares Layout, Poster-Grid, antippbare Buttons, mobil bedienbar). **Kein aufwändiges Design** – das kommt in einer späteren Phase. Ein einzelnes `styles.css` genügt.

---

## 13. TMDB-Attribution (Pflicht)

Im **Mehr → Über**-Bereich anzeigen:
- das offizielle **TMDB-Logo** (weniger prominent als das filmio-Logo), und
- den Satz: **„This product uses the TMDB API but is not endorsed or certified by TMDB."**

---

## 14. Akzeptanz-Checkliste

- [ ] Suche findet Filme über TMDB (de-DE) und zeigt Poster.
- [ ] Film lässt sich zur Watchlist **oder** direkt zu Gesehen (mit Fragebogen) hinzufügen.
- [ ] Fragebogen: 15 Fragen einzeln, Auto-Weiter, Sterne werden korrekt berechnet.
- [ ] Watchlist-Film „als gesehen markieren" startet den Fragebogen.
- [ ] Gesehen-Liste: sortieren, filtern, suchen funktioniert.
- [ ] Detailseite zeigt Sterne, Antwortprofil, Notiz; bewerten/löschen/verschieben geht.
- [ ] Export erzeugt JSON-Datei; Import mit Merge **und** Ersetzen funktioniert inkl. Validierung.
- [ ] App ist installierbar (Manifest), Liste + Poster offline nutzbar, Suche zeigt Offline-Hinweis.
- [ ] Deploy via GitHub Actions läuft, App erreichbar unter `/filmio/`.
- [ ] TMDB-Attribution sichtbar.
```
