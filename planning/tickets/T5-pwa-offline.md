---
id: T5
titel: PWA- & Offline-Strategie
typ: grilling
modus: HITL
status: geschlossen
blockiert_von: []
---

## Question

PWA- & Offline-Verhalten.

## Antwort

- **`vite-plugin-pwa`** (Workbox), `registerType: 'autoUpdate'`.
- **Precache:** App-Shell (Build-Assets).
- **Runtime-Cache:** Poster-Bilder von `image.tmdb.org` → **CacheFirst** (z.B. 500 Einträge, 30 Tage). Eigene Daten liegen eh in `localStorage`.
- **Offline:** eigene Liste (Gesehen + Watchlist) voll nutzbar; **nur die TMDB-Suche braucht Netz** → kleiner „offline – Suche braucht Internet"-Hinweis.
- **Manifest:** `name`/`short_name` „filmio", `display: standalone`, `start_url`/`scope` = `/filmio/`, Theme/BG-Color Platzhalter, **Icons = Platzhalter** (192/512/maskable) bis zur Design-Phase. Installierbar am iPhone.
