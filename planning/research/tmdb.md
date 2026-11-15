# TMDB API – Recherche für filmio (Client-only React-PWA, kein Backend)

> Ergebnis von Ticket **T1**. Quelle: offizielle TMDB-Developer-Docs + Verifikation.

## 1. Auth: API-Key (v3) vs. Read Access Token (v4)

Im Account unter **Settings → API** gibt es zwei Credentials mit **gleichem Zugriff**:

| | API Key (v3) | Read Access Token (v4) |
|---|---|---|
| Format | 32-stelliger Hex-String | langer JWT |
| Übergabe | Query-Param `?api_key=XXX` | Header `Authorization: Bearer <token>` |
| Von TMDB empfohlen | – | **ja** (nicht in URL/Logs) |

**Beschaffung:** Account auf themoviedb.org, E-Mail verifizieren (sonst `401`), Settings → API → Key anfragen, Typ **„Developer"** für privat/nicht-kommerziell.

```bash
# v4 Bearer (empfohlen)
curl 'https://api.themoviedb.org/3/search/movie?query=fight%20club&language=de-DE' \
  -H 'Authorization: Bearer <READ_ACCESS_TOKEN>' -H 'accept: application/json'
```

**Client-Code:** Key UND Token sind im Browser sichtbar (Network-Tab, Bundle) – nicht verhinderbar. v4 bringt client-seitig **keinen Sicherheitsvorteil**, nur sauberere Übergabe. Für eine **private Single-User-App** ist das unkritisch; Restrisiko = Key-Scraping → bei Missbrauch **Key neu generieren**. Ein explizites ToS-Verbot der Key-Exposition war nicht belegbar (ToS-Seite robots-gesperrt).

## 2. Suche – `search/movie`

`GET https://api.themoviedb.org/3/search/movie`

| Parameter | Hinweis |
|---|---|
| `query` | **Pflicht**, URL-encoden |
| `language` | → `de-DE` |
| `include_adult` | `false` |
| `primary_release_year` / `year` | Jahr präzise / breit |
| `page` | Paginierung |

**Response je Treffer:** `id`, `title`, `original_title`, `release_date`, `overview`, `poster_path`, `backdrop_path`, `genre_ids` (nur IDs → via `genre/movie/list` auf Namen mappen), `vote_average`, `vote_count`, `popularity`, `adult`.

## 3. Film-Details – `movie/{id}`

`GET https://api.themoviedb.org/3/movie/{movie_id}` · `language=de-DE` · `append_to_response=credits,videos` (spart Round-Trips).

**Felder:** `runtime` (Min, int), `genres` (`[{id,name}]`), `overview`, `release_date`, `original_title`, `tagline`, `vote_average`, `imdb_id`, `homepage` …

## 4. Bilder

- Secure Base-URL: `https://image.tmdb.org/t/p/`
- Poster-Größen: `w92, w154, w185, w342, w500, w780, original`
- URL bauen: `secure_base_url` + Größe + `poster_path` (enthält führenden `/`).

**Beispiel:** `https://image.tmdb.org/t/p/w500/1E5baAaEse26fej7uHcjOgEE2t2.jpg`

Base-URL + Größen können hartcodiert/gecached werden (`/configuration` nur selten abrufen).

## 5. CORS

**Ja** – direkte Browser-Requests ohne Proxy möglich. `api.themoviedb.org` sendet `Access-Control-Allow-Origin: *`; `image.tmdb.org` ebenfalls. **Stolperstein:** saubere Pfade ohne Trailing-Slash (sonst Redirect bricht Preflight).

## 6. Rate-Limits

Altes Limit (40/10s) seit 16.12.2019 abgeschaltet; nur noch weiche Grenze ~40–50 req/s gegen Scraping. Überschreitung → `429` → Backoff. Für Single-User **irrelevant**.

## 7. Attribution / ToS (Pflicht)

- TMDB-**Logo** anzeigen (nur offizielle Assets, weniger prominent als eigenes Logo).
- Hinweis-Wortlaut: **„This product uses the TMDB API but is not endorsed or certified by TMDB."**
- Platzierung im **About/Credits**-Bereich.

---

## Empfehlung für filmio

- **Auth:** v4 **Read Access Token** per Bearer-Header. In Vite als `VITE_TMDB_TOKEN` (bleibt im Bundle sichtbar). **Eigener Non-Commercial-Key**, bei Missbrauch regenerieren.
- **Sprache:** `language=de-DE`. Fallback: deutsche `overview` oft leer → bei leerem `overview` denselben Film mit `en-US` nachladen.
- **Poster:** Listen-Thumbs `w185`, Karten/Detail `w342`–`w500`, `original` nur bei Bedarf; Retina via `srcset`.
- **GitHub-Pages-Stolpersteine:**
  - Token landet im öffentlichen Bundle (auch bei Actions-Secret) → nur Wegwerf-Key, `.env` nicht committen.
  - CORS unproblematisch (`flaschd1.github.io` wird akzeptiert).
  - Routing: da **kein Router** geplant (Views über State), **kein** Deep-Link-/404-Problem. (Mit Router bräuchte man HashRouter/`404.html`.)
  - `base: '/<repo>/'` in Vite setzen, sonst brechen Asset- + Service-Worker-Pfade; SW-Scope unter dem Repo-Subpath.
  - Poster immer über **https** (`secure_base_url`) → kein Mixed Content.

## Einschränkungen der Recherche

- ToS-Volltext nicht abrufbar (robots-gesperrt) → Key-Exposition-Einschätzung stützt sich auf FAQ/Developer-Guidance.
- CORS nicht live getestet (Sandbox blockt TMDB-Hosts), aber über Forum-Evidenz belegt.
