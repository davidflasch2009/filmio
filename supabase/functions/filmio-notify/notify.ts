// Was gibt es Neues für die Watchlist? Reine Logik – ohne Netz, damit sie sich testen lässt.
import type { PushMessage } from "./webpush.ts"

export type Region = "DE" | "AT" | "CH"

export interface StoreFilm { tmdbId: number; title: string; status: string }
export interface StoreService { id: number; name: string; ids: number[] }

/** Das Nötige aus TMDB: Anbieter im Abo und Kinostarts je Land. */
export interface FilmFacts {
  stream: Partial<Record<Region, number[]>>
  cinema: Partial<Record<Region, string>> // YYYY-MM-DD, erster Kinostart im Land
}

export interface RegionState {
  /** Filme, die beim letzten Lauf bei meinen Diensten liefen. */
  available: number[]
  /** Filme, für die der Kinostart schon gemeldet wurde. */
  cinema: number[]
}
export type NotifyState = Partial<Record<Region, RegionState>>

interface TmdbProvider { provider_id: number }
interface TmdbDetails {
  "watch/providers"?: { results?: Record<string, { flatrate?: TmdbProvider[]; free?: TmdbProvider[]; ads?: TmdbProvider[] } | undefined> }
  release_dates?: { results?: { iso_3166_1: string; release_dates?: { type: number; release_date: string }[] }[] }
}

const REGIONS: Region[] = ["DE", "AT", "CH"]

export function factsFromTmdb(d: TmdbDetails): FilmFacts {
  const facts: FilmFacts = { stream: {}, cinema: {} }
  for (const r of REGIONS) {
    const w = d["watch/providers"]?.results?.[r]
    facts.stream[r] = [...(w?.flatrate ?? []), ...(w?.free ?? []), ...(w?.ads ?? [])].map((p) => p.provider_id)
    const dates = d.release_dates?.results?.find((x) => x.iso_3166_1 === r)?.release_dates ?? []
    const first = dates.filter((x) => x.type === 2 || x.type === 3).map((x) => x.release_date.slice(0, 10)).sort()[0]
    if (first) facts.cinema[r] = first
  }
  return facts
}

/** Datum minus n Tage (YYYY-MM-DD). */
function minusDays(day: string, n: number): string {
  const d = new Date(`${day}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() - n)
  return d.toISOString().slice(0, 10)
}

const quote = (t: string) => `„${t}“`

function joinTitles(items: string[], max = 3): string {
  const shown = items.slice(0, max)
  return items.length > max ? `${shown.join(", ")} und ${items.length - max} weitere` : shown.length > 1
    ? `${shown.slice(0, -1).join(", ")} und ${shown[shown.length - 1]}`
    : shown[0] ?? ""
}

/**
 * Neue Mitteilungen für ein Land.
 * - Läuft ein Watchlist-Film neu bei einem meiner Dienste → „Läuft jetzt bei …“.
 *   Beim allerersten Lauf wird nur der Stand gemerkt (sonst käme eine Flut).
 * - Kinostart im Land heute (oder in den letzten 2 Tagen, falls ein Lauf ausfiel) → „Ab heute im Kino“.
 */
export function computeNotifications(
  films: StoreFilm[], services: StoreService[], facts: Map<number, FilmFacts>,
  prev: RegionState | undefined, region: Region, today: string,
): { messages: PushMessage[]; state: RegionState } {
  const watchlist = films.filter((f) => f.status === "watchlist" && facts.has(f.tmdbId))
  const ids = new Set(watchlist.map((f) => f.tmdbId))
  const prevAvailable = new Set(prev?.available ?? [])
  const prevCinema = new Set((prev?.cinema ?? []).filter((id) => ids.has(id)))

  const available: number[] = []
  const newStreams: { film: StoreFilm; service: string }[] = []
  const newCinema: StoreFilm[] = []

  for (const film of watchlist) {
    const f = facts.get(film.tmdbId)!
    const streamIds = new Set(f.stream[region] ?? [])
    const mine = services.filter((s) => s.ids.some((id) => streamIds.has(id)))
    if (mine.length) {
      available.push(film.tmdbId)
      if (prev && !prevAvailable.has(film.tmdbId)) newStreams.push({ film, service: mine[0].name })
    }
    const start = f.cinema[region]
    if (start && start <= today && start >= minusDays(today, 2) && !prevCinema.has(film.tmdbId)) {
      newCinema.push(film)
      prevCinema.add(film.tmdbId)
    }
  }

  const messages: PushMessage[] = []
  if (newStreams.length === 1) {
    const { film, service } = newStreams[0]
    messages.push({ title: `Läuft jetzt bei ${service}`, body: `${quote(film.title)} von deiner Watchlist`, url: `?film=${film.tmdbId}`, tag: `stream-${film.tmdbId}` })
  } else if (newStreams.length > 1) {
    messages.push({
      title: `${newStreams.length} Watchlist-Filme laufen jetzt bei deinen Diensten`,
      body: joinTitles(newStreams.map((s) => `${quote(s.film.title)} (${s.service})`)),
      url: "?tab=watchlist",
      tag: "streams",
    })
  }
  if (newCinema.length === 1) {
    messages.push({ title: "Ab heute im Kino", body: `${quote(newCinema[0].title)} von deiner Watchlist`, url: `?film=${newCinema[0].tmdbId}`, tag: `cinema-${newCinema[0].tmdbId}` })
  } else if (newCinema.length > 1) {
    messages.push({ title: `${newCinema.length} Watchlist-Filme ab heute im Kino`, body: joinTitles(newCinema.map((f) => quote(f.title))), url: "?tab=watchlist", tag: "cinema" })
  }

  return { messages, state: { available, cinema: [...prevCinema] } }
}

/** Heutiges Datum in Deutschland (YYYY-MM-DD). */
export function todayBerlin(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit" }).format(now)
}
