import type { FilmInfo } from "../types"

const BASE = "https://api.themoviedb.org/3"
const IMG = "https://image.tmdb.org/t/p"
const TOKEN = import.meta.env.VITE_TMDB_TOKEN ?? ""
const headers = {
  Authorization: `Bearer ${TOKEN}`,
  accept: "application/json",
}

/** false, wenn beim Build kein VITE_TMDB_TOKEN gesetzt war. */
export const hasToken = TOKEN.trim() !== ""

export interface TmdbSearchResult {
  id: number
  title: string
  original_title?: string
  release_date?: string
  overview?: string
  poster_path: string | null
  genre_ids?: number[]
  vote_average?: number
}

export interface TmdbMovieDetails {
  id: number
  title: string
  original_title?: string
  release_date?: string
  overview?: string | null
  poster_path: string | null
  genres?: { id: number; name: string }[]
  runtime?: number | null
}

export class TmdbError extends Error {
  status: number | null
  constructor(message: string, status: number | null) {
    super(message)
    this.name = "TmdbError"
    this.status = status
  }
}

async function request<T>(url: string, signal?: AbortSignal): Promise<T> {
  if (!hasToken) {
    throw new TmdbError("Kein TMDB-Token konfiguriert (VITE_TMDB_TOKEN fehlt beim Build).", null)
  }
  let res: Response
  try {
    res = await fetch(url, { headers, signal })
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") throw e
    throw new TmdbError("Netzwerkfehler – TMDB ist nicht erreichbar. Bist du online?", null)
  }
  if (!res.ok) {
    const msg = res.status === 401
      ? "TMDB lehnt den Token ab (401). Ist VITE_TMDB_TOKEN korrekt?"
      : res.status === 404
        ? "Film bei TMDB nicht gefunden (404)."
        : res.status === 429
          ? "Zu viele Anfragen an TMDB (429). Bitte kurz warten."
          : `TMDB ${res.status}`
    throw new TmdbError(msg, res.status)
  }
  return (await res.json()) as T
}

export async function searchMovies(query: string, signal?: AbortSignal) {
  const url = `${BASE}/search/movie?query=${encodeURIComponent(query)}&language=de-DE&include_adult=false`
  const data = await request<{ results?: TmdbSearchResult[] }>(url, signal)
  return data.results ?? []
}

export async function getMovie(id: number, language: "de-DE" | "en-US" = "de-DE") {
  return await request<TmdbMovieDetails>(`${BASE}/movie/${id}?language=${language}`)
}

export function posterUrl(path: string | null, size: "w185" | "w342" | "w500" = "w342") {
  return path ? `${IMG}/${size}${path}` : null
}

/** "2019-05-30" → 2019 */
export function yearFromDate(date: string | undefined | null): number | null {
  if (!date) return null
  const y = Number.parseInt(date.slice(0, 4), 10)
  return Number.isFinite(y) && y > 0 ? y : null
}

const infoCache = new Map<number, FilmInfo>()

/**
 * Holt alle Felder, die beim Hinzufügen im Film gecached werden.
 * Ist die deutsche Overview leer, wird die englische nachgeladen.
 */
export async function loadFilmInfo(id: number): Promise<FilmInfo> {
  const cached = infoCache.get(id)
  if (cached) return cached

  const de = await getMovie(id, "de-DE")
  let overview = (de.overview ?? "").trim()
  if (!overview) {
    try {
      const en = await getMovie(id, "en-US")
      overview = (en.overview ?? "").trim()
    } catch {
      // Englischer Fallback ist optional.
    }
  }

  const info: FilmInfo = {
    tmdbId: de.id,
    title: de.title || de.original_title || "Unbekannter Titel",
    year: yearFromDate(de.release_date),
    posterPath: de.poster_path ?? null,
    genres: (de.genres ?? []).map((g) => g.name),
    overview,
    runtime: de.runtime ? de.runtime : null,
  }
  infoCache.set(id, info)
  return info
}
