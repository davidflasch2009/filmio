---
label: wayfinder:map
titel: filmio – Film-Tracker PWA
sprache: de
stand: 2026-11-15
status: fertig
---

# filmio – Wayfinder Map  ✅ FERTIG

Alle Tickets geschlossen. Destination erreicht → **`../Anleitung.md`**.

## Ziel (Destination)

Eine vollständige `Anleitung.md`, so präzise und lückenlos, dass eine KI die
komplette **filmio**-App in **einem Durchlauf** bauen kann: eine Single-User-PWA
zum Tracken gesehener Filme (mit berechneter Bewertung) + einer Watchlist,
Filmdaten über TMDB, lokal im Browser gespeichert, gehostet auf GitHub Pages.

## Notes

- Domain: persönliche Film-Tracking-PWA, Web (React).
- Modus war Planung — Ergebnis ist die Anleitung, nicht die gebaute App.
- Sprache der Anleitung: Deutsch.
- Visuelles Design bewusst später.

## Decisions so far

- **Rahmen:** Single-User, kein Backend, kein Login — läuft komplett im Browser. Filmdaten via TMDB. Map + Anleitung als Markdown.
- **Persistenz:** nur lokal (Browser-Storage), mit robustem JSON-Export/Import; kein Auto-Sync.
- **Stack:** React + Vite + TypeScript + `vite-plugin-pwa`; Deploy auf GitHub Pages; kein Router (Views über State); mobile-first.
- **Umfang:** drin = TMDB-Suche→Hinzufügen, zwei Listen (Gesehen + Watchlist), Watchlist→Gesehen, Sortieren/Filtern/Suchen, Export/Import. Draußen (später) = Statistiken, Genre-Tags-Feature, mehrere Listen, Social, visuelles Design.
- **TMDB-API (T1 ✅):** v4-Bearer-Token; direkt aus dem Browser (CORS `*`); `de-DE` + en-Fallback; Poster `image.tmdb.org/t/p/{size}{poster_path}`; Token im Bundle sichtbar → Wegwerf-Key; Attribution-Pflicht. → `research/tmdb.md`.
- **Bewertung (T2 ✅):** 15 feste Ja/Neutral/Nein-Fragen im Bauchgefühl-Stil (Ja=gut), „Sieb"-Fragen gegen Noten-Inflation, Immersion = Rückgrat. Sterne = runde(Punkte/15×5 auf 0,5), min 0,5. Antworten gespeichert. → `tickets/T2`.
- **Datenschema (T3 ✅):** `Film`-Typ + `localStorage["filmio.v1"] = {version, films[]}`; Export `.json`; Import Merge/Ersetzen; TMDB-Felder gecached. → `tickets/T3`.
- **App-Struktur (T4 ✅):** mobile-first, 4 Bottom-Tabs (Suche/Gesehen/Watchlist/Mehr), Detailansicht, Fragebogen eine-Frage-pro-Screen mit Auto-Weiter. → `tickets/T4`.
- **PWA/Offline (T5 ✅):** `vite-plugin-pwa`, Poster CacheFirst, Liste offline, Suche braucht Netz, installierbar. → `tickets/T5`.
- **Deployment (T6 ✅):** Repo `filmio` (public), GitHub Actions → Pages, `base:'/filmio/'`, Token als Secret. → `tickets/T6`.

## Out of scope

- Visuelles Design / finaler Look (spätere Phase).
- Backend, Login, Mehrbenutzer, geräteübergreifendes Auto-Sync.
- Statistiken/Charts, Genre-Tag-Verwaltung, mehrere Listen, Teilen/Social.

## Tickets

| ID | Titel | Status |
|----|-------|--------|
| T1 | TMDB-API Recherche | ✅ → `research/tmdb.md` |
| T2 | Bewertungs-Fragebogen & Scoring | ✅ → `tickets/T2` |
| T3 | Datenschema & Export/Import-Format | ✅ → `tickets/T3` |
| T4 | App-Struktur & Navigation | ✅ → `tickets/T4` |
| T5 | PWA- & Offline-Strategie | ✅ → `tickets/T5` |
| T6 | Deployment & Repo-Setup | ✅ → `tickets/T6` |
| T7 | Anleitung.md zusammenschreiben | ✅ → `../Anleitung.md` |

## Nächster Schritt (außerhalb dieser Map)

`Anleitung.md` einer KI geben → App bauen lassen. Danach eigene Design-Phase.
