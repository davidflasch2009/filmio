import type { Film } from "../types"
import { GENRE_IDS } from "./genres"
import { listItemToInfo, type Collection, type TmdbListItem } from "./tmdb"
import { newFilm } from "./storage"

/**
 * Filmreihen für den Würfel: Zu welcher Reihe gehört ein Film, und welche Teile hat sie?
 * Nur ein Zwischenspeicher pro Gerät (nicht abgeglichen) – fehlt etwas, wird es bei TMDB nachgeschlagen.
 */
const KEY = "filmio.series.v1"
/** Teile einer Reihe nach so vielen Tagen neu holen (neue Teile kommen dazu). */
const REFRESH_DAYS = 30

export interface SeriesPart {
  id: number
  title: string
  date: string | null
  posterPath: string | null
  backdropPath: string | null
  genreIds: number[]
  overview: string
}

export interface SeriesInfo {
  name: string
  /** Nach Erscheinungsdatum sortiert. */
  parts: SeriesPart[]
  checkedAt: string
}

export interface SeriesCache {
  /** tmdbId → Reihe (null = gehört zu keiner). Fehlt = noch nicht nachgeschlagen. */
  films: Record<string, number | null>
  collections: Record<string, SeriesInfo>
}

export function loadSeries(): SeriesCache {
  try {
    const raw = localStorage.getItem(KEY)
    const data = raw ? (JSON.parse(raw) as Partial<SeriesCache>) : {}
    return { films: data.films ?? {}, collections: data.collections ?? {} }
  } catch {
    return { films: {}, collections: {} }
  }
}

export function saveSeries(cache: SeriesCache): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(cache))
  } catch {
    // Speicher voll o.ä.: dann eben beim nächsten Mal neu nachschlagen.
  }
}

export function seriesFromCollection(c: Collection): SeriesInfo {
  return {
    name: c.name,
    parts: c.parts.map((p) => ({
      id: p.id, title: p.title || p.original_title || "", date: p.release_date || null, posterPath: p.poster_path ?? null,
      backdropPath: p.backdrop_path ?? null, genreIds: p.genre_ids ?? [], overview: p.overview ?? "",
    })),
    checkedAt: new Date().toISOString(),
  }
}

export function seriesNeedsRefresh(info: SeriesInfo | undefined, now = Date.now()): boolean {
  return !info || now - Date.parse(info.checkedAt) > REFRESH_DAYS * 86_400_000
}

/** Ein Vorschlag des Würfels. */
export interface Candidate {
  film: Film
  /** false = fälliger Teil einer Reihe, der (noch) nicht auf der Watchlist steht. */
  saved: boolean
  /** Teil einer Filmreihe: Name, Nummer, Anzahl erschienener Teile. */
  series?: { name: string; part: number; total: number }
}

const GENRE_NAMES = Object.fromEntries(Object.entries(GENRE_IDS).map(([name, id]) => [id, name]))

function partToFilm(p: SeriesPart): Film {
  const item: TmdbListItem = {
    id: p.id, title: p.title, release_date: p.date ?? undefined, poster_path: p.posterPath, backdrop_path: p.backdropPath, overview: p.overview,
  }
  return { ...newFilm(listItemToInfo(item)), genres: p.genreIds.map((g) => GENRE_NAMES[g]).filter(Boolean) }
}

/** Ein Watchlist-Film, der warten muss, weil ein früherer Teil seiner Reihe noch nicht gesehen ist. */
export interface Waiting {
  /** Der fällige (früheste erschienene, noch nicht gesehene) Teil. */
  next: SeriesPart
  /** Nummer des fälligen Teils und Anzahl erschienener Teile. */
  part: number
  total: number
  name: string
}

const todayStamp = () => new Date().toISOString().slice(0, 10)

/** Reihe eines Films mit ihren erschienenen Teilen – null, wenn keine (oder noch unbekannt). */
function releasedParts(film: Film, cache: SeriesCache, today: string): { info: SeriesInfo; released: SeriesPart[] } | null {
  const colId = cache.films[film.tmdbId]
  const info = colId == null ? undefined : cache.collections[colId]
  if (!info) return null
  const released = info.parts.filter((p) => p.date && p.date <= today)
  return released.some((p) => p.id === film.tmdbId) ? { info, released } : null
}

/** Muss dieser Film noch warten? Dann: welcher Teil ist zuerst dran. */
export function waitingFor(film: Film, byId: Map<number, Film>, cache: SeriesCache, today = todayStamp()): Waiting | null {
  const s = releasedParts(film, cache, today)
  if (!s) return null
  const idx = s.released.findIndex((p) => byId.get(p.id)?.status !== "watched")
  if (idx < 0 || s.released[idx].id === film.tmdbId) return null
  return { next: s.released[idx], part: idx + 1, total: s.released.length, name: s.info.name }
}

/** Fälliger Teil als (nicht gespeicherter) Film – für Vorschlagskarte und Würfel. */
export function partAsFilm(p: SeriesPart): Film {
  return partToFilm(p)
}

/**
 * Was der Würfel aus der Watchlist vorschlagen darf: Bei Filmreihen immer nur den frühesten erschienenen Teil,
 * der noch nicht gesehen ist – auch wenn der nicht auf der Watchlist steht (dann als nicht gespeicherter Vorschlag).
 * Steht der fällige Teil auf der Watchlist, kommt er über seinen eigenen Eintrag (wenn er zum Filter passt).
 */
export function candidates(watchlist: Film[], all: Film[], cache: SeriesCache, today = todayStamp()): Candidate[] {
  const byId = new Map(all.map((f) => [f.tmdbId, f]))
  const out = new Map<number, Candidate>()
  for (const film of watchlist) {
    const s = releasedParts(film, cache, today)
    if (!s) {
      out.set(film.tmdbId, { film, saved: true })
      continue
    }
    const series = (id: number) => ({ name: s.info.name, part: s.released.findIndex((p) => p.id === id) + 1, total: s.released.length })
    const wait = waitingFor(film, byId, cache, today)
    if (!wait) {
      out.set(film.tmdbId, { film, saved: true, series: series(film.tmdbId) })
      continue
    }
    // Ein früherer Teil ist dran. Steht er auf der Watchlist, kommt er über seinen eigenen Eintrag.
    if (byId.has(wait.next.id)) continue
    if (!out.has(wait.next.id)) out.set(wait.next.id, { film: partToFilm(wait.next), saved: false, series: series(wait.next.id) })
  }
  return [...out.values()]
}
