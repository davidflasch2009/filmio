// Filme, die gerade in meinem Kino laufen – als TMDB-Einträge für die Stöber-Reihe.
// Cineplexx liefert nur Titel; die passenden TMDB-Filme werden einmal gesucht und dann gemerkt.
import { normTitle, type CpxMovie } from "./cineplexx"
import { searchMovies, yearFromDate, type TmdbListItem } from "./tmdb"

const KEY = "filmio.cpx.tmdb"
const MAX_AGE = 7 * 24 * 3600 * 1000

type Cache = Record<string, { at: number; item: TmdbListItem | null }>

function read(): Cache {
  try {
    const c = JSON.parse(localStorage.getItem(KEY) || "{}") as unknown
    return c && typeof c === "object" && !Array.isArray(c) ? (c as Cache) : {}
  } catch {
    return {}
  }
}

/** Bester TMDB-Treffer: gleicher Titel (deutsch oder original) und Jahr ±1, sonst nichts. */
async function findOnTmdb(m: CpxMovie): Promise<TmdbListItem | null> {
  const titles = new Set([normTitle(m.title), normTitle(m.originalTitle)].filter(Boolean))
  const yearOk = (r: TmdbListItem) => {
    const y = yearFromDate(r.release_date)
    return m.year === null || y === null || Math.abs(y - m.year) <= 1
  }
  for (const q of [...new Set([m.title, m.originalTitle].filter(Boolean))]) {
    const results = await searchMovies(q)
    const hit = results.find((r) => yearOk(r) && (titles.has(normTitle(r.title)) || titles.has(normTitle(r.original_title ?? ""))))
    if (hit) return hit
  }
  return null
}

/** Filme im Programm meines Kinos, neueste zuerst; nur solche, die es bei TMDB mit Poster gibt. */
export async function loadCinemaRow(programme: CpxMovie[], cinemaId: string): Promise<TmdbListItem[]> {
  const movies = programme.filter((m) => m.cinemaIds.includes(cinemaId))
    .sort((a, b) => (b.year ?? 0) - (a.year ?? 0) || a.title.localeCompare(b.title, "de"))
  const cache = read()
  const now = Date.now()
  const queue = movies.filter((m) => !cache[m.id] || now - cache[m.id].at > MAX_AGE)
  const worker = async () => {
    while (queue.length) {
      const m = queue.shift()!
      try {
        cache[m.id] = { at: Date.now(), item: await findOnTmdb(m) }
      } catch {
        // Netzfehler: beim nächsten Mal wieder versuchen.
      }
    }
  }
  await Promise.all([worker(), worker(), worker(), worker()])
  try { localStorage.setItem(KEY, JSON.stringify(cache)) } catch { /* nur Cache */ }
  const seen = new Set<number>()
  return movies
    .map((m) => cache[m.id]?.item ?? null)
    .filter((i): i is TmdbListItem => !!i && !!i.poster_path && !seen.has(i.id) && !!seen.add(i.id))
}
