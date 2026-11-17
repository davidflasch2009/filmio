import type { FilmInfo, ReleaseInfo, RegionCode, Service } from "../types"
import type { Region } from "./settings"

const BASE = "https://api.themoviedb.org/3"
const IMG = "https://image.tmdb.org/t/p"
const TOKEN = import.meta.env.VITE_TMDB_TOKEN ?? ""
const headers = {
  Authorization: `Bearer ${TOKEN}`,
  accept: "application/json",
}

/** false, wenn beim Build kein VITE_TMDB_TOKEN gesetzt war. */
export const hasToken = TOKEN.trim() !== ""

/** Eintrag in Suchtreffern und Listen (Trends, Empfehlungen, Filmreihen …). */
export interface TmdbListItem {
  id: number
  title: string
  original_title?: string
  release_date?: string
  overview?: string
  poster_path: string | null
  backdrop_path?: string | null
  genre_ids?: number[]
  vote_average?: number
}
export type TmdbSearchResult = TmdbListItem

export interface TmdbMovieDetails {
  id: number
  title: string
  original_title?: string
  release_date?: string
  overview?: string | null
  poster_path: string | null
  backdrop_path?: string | null
  genres?: { id: number; name: string }[]
  runtime?: number | null
  tagline?: string | null
  belongs_to_collection?: { id: number; name: string } | null
  credits?: {
    cast?: { id: number; name: string; character?: string; profile_path: string | null; order?: number }[]
    crew?: { id: number; name: string; job?: string }[]
  }
  videos?: { results?: { key: string; site: string; type: string; iso_639_1?: string; official?: boolean }[] }
  "watch/providers"?: { results?: Record<string, TmdbWatchRegion | undefined> }
  recommendations?: { results?: TmdbListItem[] }
  status?: string
  release_dates?: { results?: { iso_3166_1: string; release_dates?: { type: number; release_date: string }[] }[] }
}

interface TmdbProvider { provider_id: number; provider_name: string; logo_path: string | null; display_priority?: number }
interface TmdbWatchRegion { link?: string; flatrate?: TmdbProvider[]; free?: TmdbProvider[]; ads?: TmdbProvider[]; rent?: TmdbProvider[]; buy?: TmdbProvider[] }

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

export function backdropUrl(path: string | null | undefined, size: "w780" | "w1280" = "w780") {
  return path ? `${IMG}/${size}${path}` : null
}

/** Porträts (Besetzung) und Anbieter-Logos. */
export function smallImageUrl(path: string | null, size: "w92" | "w185" = "w185") {
  return path ? `${IMG}/${size}${path}` : null
}

const RELEASE_REGIONS: RegionCode[] = ["DE", "AT", "CH"]

/**
 * Erscheinungstermine aus den TMDB-Daten. Je Land zählt der erste Kinostart (Typ 2/3),
 * sonst die erste digitale Veröffentlichung (Typ 4, z.B. direkt bei einem Streamingdienst).
 */
export function parseRelease(d: Pick<TmdbMovieDetails, "release_date" | "status" | "release_dates">, checkedAt = new Date().toISOString()): ReleaseInfo {
  const day = (iso: string | undefined) => (iso && /^\d{4}-\d{2}-\d{2}/.test(iso) ? iso.slice(0, 10) : null)
  const local: ReleaseInfo["local"] = {}
  for (const r of RELEASE_REGIONS) {
    const dates = d.release_dates?.results?.find((x) => x.iso_3166_1 === r)?.release_dates ?? []
    const first = (types: number[]) => dates.filter((x) => types.includes(x.type)).map((x) => day(x.release_date)).filter((x) => x !== null).sort()[0]
    const cinema = first([2, 3])
    const digital = first([4])
    if (cinema) local[r] = { date: cinema, cinema: true }
    else if (digital) local[r] = { date: digital, cinema: false }
  }
  return { date: day(d.release_date), local, pending: !!d.status && d.status !== "Released", checkedAt }
}

/** Nachzuladende Felder für gespeicherte Filme: Szenenbild + Erscheinungstermine. null = Film gibt es bei TMDB nicht (mehr). */
export async function fetchFilmMeta(id: number): Promise<Pick<FilmInfo, "backdropPath" | "release"> | null> {
  try {
    const d = await request<TmdbMovieDetails>(`${BASE}/movie/${id}?language=de-DE&append_to_response=release_dates`)
    return { backdropPath: d.backdrop_path ?? null, release: parseRelease(d) }
  } catch (e) {
    if (e instanceof TmdbError && e.status === 404) return null
    throw e
  }
}

/** IDs der Anbieter, bei denen der Film im Abo/kostenlos läuft – je Land. */
export async function fetchStreamIds(id: number): Promise<Record<RegionCode, number[]>> {
  const data = await request<{ results?: Record<string, TmdbWatchRegion | undefined> }>(`${BASE}/movie/${id}/watch/providers`)
  const out = {} as Record<RegionCode, number[]>
  for (const r of RELEASE_REGIONS) {
    const reg = data.results?.[r]
    out[r] = [...new Set([...(reg?.flatrate ?? []), ...(reg?.free ?? []), ...(reg?.ads ?? [])].map((p) => p.provider_id))]
  }
  return out
}

/** Name ohne Werbe-Variante: „Netflix Standard with Ads“ → „Netflix“. */
function baseProviderName(name: string): string {
  return name.replace(/\s+(standard|basic)?\s*with ads$/i, "").trim()
}

/** Alle Streaming-Dienste eines Landes (für „Meine Dienste“), beliebteste zuerst; Werbe-Varianten zusammengefasst. */
export async function loadServiceCatalog(region: RegionCode): Promise<Service[]> {
  const data = await request<{ results?: (TmdbProvider & { display_priorities?: Record<string, number> })[] }>(
    `${BASE}/watch/providers/movie?language=de-DE&watch_region=${region}`)
  const all = (data.results ?? []).slice()
    .sort((a, b) => (a.display_priorities?.[region] ?? a.display_priority ?? 999) - (b.display_priorities?.[region] ?? b.display_priority ?? 999))
  const byName = new Map<string, Service>()
  for (const p of all) {
    const name = baseProviderName(p.provider_name)
    const existing = byName.get(name.toLowerCase())
    if (existing) {
      existing.ids.push(p.provider_id)
      continue
    }
    byName.set(name.toLowerCase(), { id: p.provider_id, name, logoPath: p.logo_path ?? null, ids: [p.provider_id] })
  }
  return [...byName.values()]
}

/** "2019-05-30" → 2019 */
export function yearFromDate(date: string | undefined | null): number | null {
  if (!date) return null
  const y = Number.parseInt(date.slice(0, 4), 10)
  return Number.isFinite(y) && y > 0 ? y : null
}

// ---------------------------------------------------------------------------
// Film komplett: gecachte Felder + Zusatzinfos für die Detailseite
// ---------------------------------------------------------------------------

export interface CastMember {
  id: number
  name: string
  character: string
  profilePath: string | null
}

export interface Provider {
  id: number
  name: string
  logoPath: string | null
}

export interface WatchInfo {
  /** Seite mit allen Anbietern (TMDB/JustWatch). */
  link: string | null
  /** Im Abo, kostenlos oder mit Werbung. */
  stream: Provider[]
  /** Leihen oder kaufen (ohne die Anbieter aus `stream`). */
  rentBuy: Provider[]
}

export interface MovieExtras {
  tagline: string
  directors: string[]
  cast: CastMember[]
  /** YouTube-Link zum Trailer (deutsch bevorzugt). */
  trailerUrl: string | null
  watch: Record<Region, WatchInfo>
  collection: { id: number; name: string } | null
  recommendations: TmdbListItem[]
}

export interface MovieFull {
  info: FilmInfo
  extras: MovieExtras
}

const REGION_CODES: Region[] = ["DE", "AT", "CH"]

function uniqueProviders(lists: (TmdbProvider[] | undefined)[], exclude: Set<number> = new Set()): Provider[] {
  const seen = new Set(exclude)
  const out: Provider[] = []
  for (const p of lists.flatMap((l) => l ?? []).sort((a, b) => (a.display_priority ?? 99) - (b.display_priority ?? 99))) {
    // „Netflix Standard with Ads“ u.ä. sind derselbe Dienst wie das Hauptangebot.
    if (seen.has(p.provider_id) || / with ads$/i.test(p.provider_name)) continue
    seen.add(p.provider_id)
    out.push({ id: p.provider_id, name: p.provider_name, logoPath: p.logo_path ?? null })
  }
  return out
}

function parseWatch(region: TmdbWatchRegion | undefined): WatchInfo {
  const stream = uniqueProviders([region?.flatrate, region?.free, region?.ads])
  const rentBuy = uniqueProviders([region?.rent, region?.buy], new Set(stream.map((p) => p.id)))
  return { link: region?.link ?? null, stream, rentBuy }
}

function pickTrailer(videos: NonNullable<TmdbMovieDetails["videos"]>["results"]): string | null {
  const trailers = (videos ?? []).filter((v) => v.site === "YouTube" && (v.type === "Trailer" || v.type === "Teaser"))
  const score = (v: (typeof trailers)[number]) =>
    (v.type === "Trailer" ? 4 : 0) + (v.iso_639_1 === "de" ? 2 : 0) + (v.official ? 1 : 0)
  const best = trailers.sort((a, b) => score(b) - score(a))[0]
  return best ? `https://www.youtube.com/watch?v=${encodeURIComponent(best.key)}` : null
}

const fullCache = new Map<number, MovieFull>()
const fullPending = new Map<number, Promise<MovieFull>>()

/** Bereits geladene Zusatzinfos (ohne Netz), sonst null. */
export function peekMovieFull(id: number): MovieFull | null {
  return fullCache.get(id) ?? null
}

/**
 * Lädt einen Film komplett in einer Anfrage: die Felder, die gespeichert werden, plus Besetzung, Regie,
 * Trailer, Streaming-Anbieter, Filmreihe und Empfehlungen. Ist die deutsche Handlung leer, wird die englische nachgeladen.
 */
export function loadMovieFull(id: number): Promise<MovieFull> {
  const cached = fullCache.get(id)
  if (cached) return Promise.resolve(cached)
  const pending = fullPending.get(id)
  if (pending) return pending

  const promise = (async () => {
    const de = await request<TmdbMovieDetails>(
      `${BASE}/movie/${id}?language=de-DE&append_to_response=credits,videos,watch/providers,recommendations,release_dates&include_video_language=de,en`)
    let overview = (de.overview ?? "").trim()
    if (!overview) {
      try {
        overview = ((await getMovie(id, "en-US")).overview ?? "").trim()
      } catch {
        // Englischer Fallback ist optional.
      }
    }
    const info: FilmInfo = {
      tmdbId: de.id,
      title: de.title || de.original_title || "Unbekannter Titel",
      year: yearFromDate(de.release_date),
      posterPath: de.poster_path ?? null,
      backdropPath: de.backdrop_path ?? null,
      genres: (de.genres ?? []).map((g) => g.name),
      overview,
      runtime: de.runtime ? de.runtime : null,
      release: parseRelease(de),
    }
    const regions = de["watch/providers"]?.results ?? {}
    const extras: MovieExtras = {
      tagline: (de.tagline ?? "").trim(),
      directors: (de.credits?.crew ?? []).filter((c) => c.job === "Director").map((c) => c.name),
      cast: (de.credits?.cast ?? [])
        .slice()
        .sort((a, b) => (a.order ?? 999) - (b.order ?? 999))
        .slice(0, 14)
        .map((c) => ({ id: c.id, name: c.name, character: c.character ?? "", profilePath: c.profile_path ?? null })),
      trailerUrl: pickTrailer(de.videos?.results),
      watch: Object.fromEntries(REGION_CODES.map((r) => [r, parseWatch(regions[r])])) as Record<Region, WatchInfo>,
      collection: de.belongs_to_collection ? { id: de.belongs_to_collection.id, name: de.belongs_to_collection.name } : null,
      recommendations: (de.recommendations?.results ?? []).filter((r) => r.poster_path),
    }
    const full: MovieFull = { info, extras }
    fullCache.set(id, full)
    return full
  })()
  fullPending.set(id, promise)
  void promise.catch(() => {}).finally(() => fullPending.delete(id))
  return promise
}

/** Die Felder, die beim Hinzufügen im Film gecached werden. */
export async function loadFilmInfo(id: number): Promise<FilmInfo> {
  return (await loadMovieFull(id)).info
}

/** Vorläufige Film-Infos aus einem Listeneintrag – reicht, um die Detailseite sofort zu öffnen. */
export function listItemToInfo(item: TmdbListItem): FilmInfo {
  return {
    tmdbId: item.id,
    title: item.title || item.original_title || "Unbekannter Titel",
    year: yearFromDate(item.release_date),
    posterPath: item.poster_path ?? null,
    backdropPath: item.backdrop_path ?? null,
    genres: [],
    overview: (item.overview ?? "").trim(),
    runtime: null,
  }
}

// ---------------------------------------------------------------------------
// Filmreihen und Listen zum Stöbern
// ---------------------------------------------------------------------------

export interface Collection {
  id: number
  name: string
  /** Nach Erscheinungsdatum sortiert; Teile ohne Datum am Ende. */
  parts: TmdbListItem[]
}

const collectionCache = new Map<number, Collection>()

/** Bereits geladene Filmreihe (ohne Netz), sonst null. */
export function peekCollection(id: number): Collection | null {
  return collectionCache.get(id) ?? null
}

export async function loadCollection(id: number): Promise<Collection> {
  const cached = collectionCache.get(id)
  if (cached) return cached
  const data = await request<{ id: number; name: string; parts?: TmdbListItem[] }>(`${BASE}/collection/${id}?language=de-DE`)
  const date = (p: TmdbListItem) => p.release_date || "9999"
  const collection: Collection = {
    id: data.id,
    name: data.name.replace(/\s+(Filmreihe|Collection)$/i, ""),
    parts: (data.parts ?? []).slice().sort((a, b) => date(a).localeCompare(date(b))),
  }
  collectionCache.set(id, collection)
  return collection
}

export type BrowseSource =
  | { kind: "trending" }
  | { kind: "now_playing"; region: Region }
  | { kind: "upcoming"; region: Region }
  | { kind: "popular" }
  | { kind: "top" }
  | { kind: "genre"; genreId: number }
  | { kind: "recommendations"; movieId: number }

function browseUrl(source: BrowseSource): string {
  const lang = "language=de-DE"
  switch (source.kind) {
    case "trending": return `${BASE}/trending/movie/week?${lang}`
    case "now_playing": return `${BASE}/movie/now_playing?${lang}&region=${source.region}`
    case "upcoming": return `${BASE}/movie/upcoming?${lang}&region=${source.region}`
    case "popular": return `${BASE}/movie/popular?${lang}`
    case "top": return `${BASE}/discover/movie?${lang}&include_adult=false&sort_by=vote_average.desc&vote_count.gte=5000`
    case "genre": return `${BASE}/discover/movie?${lang}&include_adult=false&sort_by=popularity.desc&vote_count.gte=300&with_genres=${source.genreId}`
    case "recommendations": return `${BASE}/movie/${source.movieId}/recommendations?${lang}`
  }
}

const listCache = new Map<string, TmdbListItem[]>()

/** Eine Filmliste zum Stöbern (nur Einträge mit Poster). Pro Sitzung gecached. */
export async function loadList(source: BrowseSource): Promise<TmdbListItem[]> {
  const url = browseUrl(source)
  const cached = listCache.get(url)
  if (cached) return cached
  const data = await request<{ results?: TmdbListItem[] }>(url)
  const items = (data.results ?? []).filter((r) => r.poster_path)
  listCache.set(url, items)
  return items
}
