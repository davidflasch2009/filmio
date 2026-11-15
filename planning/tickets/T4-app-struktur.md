---
id: T4
titel: App-Struktur & Navigation
typ: grilling
modus: HITL
status: geschlossen
blockiert_von: []
---

## Question

Funktionale App-Struktur (ohne visuelles Design).

## Antwort

- **Mobile-first**, **Bottom-Tab-Bar mit 4 Tabs:**
  1. **Suche** – TMDB-Suchfeld → Trefferliste (Poster, Titel, Jahr) → Film zu **Watchlist** oder direkt **Gesehen** (startet Fragebogen).
  2. **Gesehen** – bewertete Filme mit Sternen; **sortieren** (Bewertung/Datum/Titel), **filtern**, **suchen** in eigener Liste.
  3. **Watchlist** – Liste; Aktion „als gesehen markieren" → Fragebogen.
  4. **Mehr** – Export/Import, Über (TMDB-Attribution).
- **Detailansicht** (Film antippen): Poster, Infos (Jahr, Genres, Runtime, Overview); bei Gesehen zusätzlich Sterne + Antwortprofil + Notiz; Aktionen: bewerten/neu bewerten, auf Gesehen schieben, löschen.
- **Fragebogen-Ablauf (T4-A):** eine Frage pro Screen, großer Ja/Neutral/Nein-Button, Tipp → **Auto-Weiter**. Am Ende: berechnete Sterne + optionales Notizfeld.
