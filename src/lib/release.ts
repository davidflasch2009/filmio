import type { Film, RegionCode } from "../types"

export interface Upcoming {
  /** YYYY-MM-DD, null = Termin steht noch nicht fest. */
  date: string | null
  cinema: boolean
}

/** Heutiges Datum (lokal) als YYYY-MM-DD. */
export function todayStamp(now: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0")
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`
}

/**
 * Ist der Film im gewählten Land noch nicht erschienen? Maßgeblich ist der Start im Land
 * (Kino oder direkt digital), sonst die Erstveröffentlichung.
 */
export function upcomingRelease(film: Pick<Film, "release" | "year">, region: RegionCode, today: string = todayStamp()): Upcoming | null {
  const r = film.release
  if (!r) {
    // Termine noch nicht geholt: Ein Jahr in der Zukunft reicht als Hinweis.
    return film.year !== null && film.year > Number(today.slice(0, 4)) ? { date: null, cinema: true } : null
  }
  const local = r.local[region]
  const date = local?.date ?? r.date
  const cinema = local ? local.cinema : true
  if (date) return date > today ? { date, cinema } : null
  return r.pending ? { date: null, cinema } : null
}

const MONTHS_SHORT = ["Jan.", "Feb.", "März", "Apr.", "Mai", "Juni", "Juli", "Aug.", "Sep.", "Okt.", "Nov.", "Dez."]
const MONTHS = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"]

function parts(date: string) {
  const [y, m, d] = date.split("-").map(Number)
  return { y, m, d }
}

/** Kurz für Karten: „Kino ab 4. Dez.“ / „Ab 12. März“ / „Termin offen“. Jahr nur, wenn nicht dieses Jahr. */
export function formatUpcomingShort(u: Upcoming, today: string = todayStamp()): string {
  if (!u.date) return "Termin offen"
  const { y, m, d } = parts(u.date)
  const year = String(y) !== today.slice(0, 4) ? ` ${y}` : ""
  return `${u.cinema ? "Kino ab" : "Ab"} ${d}. ${MONTHS_SHORT[m - 1]}${year}`
}

/** Ausführlich für die Detailseite: „Kinostart 4. Dezember 2026“ / „Erscheint am 12. März 2027“. */
export function formatUpcomingLong(u: Upcoming): string {
  if (!u.date) return u.cinema ? "Kinostart noch offen" : "Termin noch offen"
  const { y, m, d } = parts(u.date)
  return `${u.cinema ? "Kinostart" : "Erscheint am"} ${d}. ${MONTHS[m - 1]} ${y}`
}

/** Termine kommender Filme regelmäßig auffrischen (Starttermine verschieben sich). */
export function releaseNeedsRefresh(film: Pick<Film, "release" | "year">, region: RegionCode, now: number = Date.now()): boolean {
  if (!film.release) return true
  if (!upcomingRelease(film, region)) return false
  return now - Date.parse(film.release.checkedAt) > 3 * 24 * 3600 * 1000
}
