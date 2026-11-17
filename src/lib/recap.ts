import type { Film } from "../types"

/** Ein Filmabend: ein Film an einem Datum (erstes Mal oder nochmal). */
export interface Viewing {
  film: Film
  date: Date
}

/** Alle datierten Filmabende. Filme ohne Datum (z.B. aus den Notizen übernommen) zählen nicht. */
export function viewings(films: Film[]): Viewing[] {
  const out: Viewing[] = []
  for (const f of films) {
    if (f.status !== "watched") continue
    for (const iso of [f.watchedAt, ...(f.rewatches ?? [])]) {
      if (!iso) continue
      const date = new Date(iso)
      if (!Number.isNaN(date.getTime())) out.push({ film: f, date })
    }
  }
  return out.sort((a, b) => a.date.getTime() - b.date.getTime())
}

/** Jahre mit mindestens einem Filmabend, neuestes zuerst. */
export function recapYears(films: Film[]): number[] {
  return [...new Set(viewings(films).map((v) => v.date.getFullYear()))].sort((a, b) => b - a)
}

export const MONTH_NAMES = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"]

export interface Recap {
  year: number
  viewings: Viewing[]
  /** Verschiedene Filme (in der Reihenfolge des ersten Abends). */
  films: Film[]
  minutes: number
  /** Stärkster Monat (0–11) und Anzahl Abende darin; null bei weniger als 3 Abenden. */
  topMonth: { month: number; count: number } | null
  /** Häufigste Genres (nach Filmen). */
  genres: { name: string; count: number }[]
  /** Bewertete Filme, beste zuerst. */
  best: Film[]
  average: number | null
  first: Viewing
  longest: Film | null
  /** Am öftesten in diesem Jahr gesehen (nur wenn mehr als einmal). */
  repeated: { film: Film; count: number } | null
}

export function buildRecap(films: Film[], year: number): Recap | null {
  const list = viewings(films).filter((v) => v.date.getFullYear() === year)
  if (list.length === 0) return null

  const distinct: Film[] = []
  const perFilm = new Map<number, number>()
  for (const v of list) {
    if (!perFilm.has(v.film.tmdbId)) distinct.push(v.film)
    perFilm.set(v.film.tmdbId, (perFilm.get(v.film.tmdbId) ?? 0) + 1)
  }

  const months = new Array<number>(12).fill(0)
  for (const v of list) months[v.date.getMonth()]++
  const topMonthIdx = months.indexOf(Math.max(...months))

  const genreCount = new Map<string, number>()
  for (const f of distinct) for (const g of f.genres) genreCount.set(g, (genreCount.get(g) ?? 0) + 1)
  const genres = [...genreCount.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "de"))
    .map(([name, count]) => ({ name, count }))

  const best = distinct.filter((f) => f.rating !== null)
    .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0) || a.title.localeCompare(b.title, "de"))
  const average = best.length ? best.reduce((s, f) => s + (f.rating ?? 0), 0) / best.length : null

  const longest = distinct.filter((f) => f.runtime).sort((a, b) => (b.runtime ?? 0) - (a.runtime ?? 0))[0] ?? null
  const [repId, repCount] = [...perFilm.entries()].sort((a, b) => b[1] - a[1])[0]

  return {
    year,
    viewings: list,
    films: distinct,
    minutes: list.reduce((s, v) => s + (v.film.runtime ?? 0), 0),
    topMonth: list.length >= 3 ? { month: topMonthIdx, count: months[topMonthIdx] } : null,
    genres,
    best,
    average,
    first: list[0],
    longest,
    repeated: repCount > 1 ? { film: distinct.find((f) => f.tmdbId === repId)!, count: repCount } : null,
  }
}

/** Häufigste Darsteller über die Filme des Jahres (mindestens in 2 Filmen). */
export function topActor(castByFilm: Map<number, { id: number; name: string; profilePath: string | null }[]>, films: Film[]) {
  const count = new Map<number, { name: string; profilePath: string | null; films: Film[] }>()
  for (const f of films) {
    // Nur die Hauptbesetzung zählt – sonst gewinnen Statisten aus Filmreihen.
    for (const c of (castByFilm.get(f.tmdbId) ?? []).slice(0, 10)) {
      const e = count.get(c.id) ?? { name: c.name, profilePath: c.profilePath, films: [] }
      e.films.push(f)
      count.set(c.id, e)
    }
  }
  const top = [...count.values()].sort((a, b) => b.films.length - a.films.length || a.name.localeCompare(b.name, "de"))[0]
  return top && top.films.length >= 2 ? top : null
}
