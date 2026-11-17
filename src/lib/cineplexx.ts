// Kinoprogramm von Cineplexx Österreich – dieselbe Schnittstelle, die cineplexx.at selbst nutzt
// (öffentlich, ohne Anmeldung, erlaubt Abrufe aus dem Browser). Inoffiziell: Ändert Cineplexx sie,
// verschwindet der Kino-Bereich einfach, die App läuft weiter.

const API = "https://app.cineplexx.at"
export const CINEPLEXX_WEB = "https://cineplexx.at"

async function get<T>(path: string): Promise<T> {
  let res: Response
  try {
    res = await fetch(API + path, { headers: { accept: "application/json", "accept-language": "de" } })
  } catch {
    throw new Error("Cineplexx ist gerade nicht erreichbar.")
  }
  if (!res.ok) throw new Error(`Cineplexx antwortet mit ${res.status}.`)
  return (await res.json()) as T
}

// ---------------------------------------------------------------------------
// Kinos
// ---------------------------------------------------------------------------

export interface CpxCinema {
  id: string
  name: string
  /** z.B. „9500 Villach“ */
  place: string
}

export async function loadCinemas(): Promise<CpxCinema[]> {
  const list = await get<{ id: string; name: string; address2?: string | null; city?: string | null }[]>("/api/v1/cinemas")
  return list
    .map((c) => ({ id: String(c.id), name: c.name.trim(), place: (c.address2 ?? c.city ?? "").trim() }))
    .sort((a, b) => a.name.localeCompare(b.name, "de"))
}

// ---------------------------------------------------------------------------
// Filme im Programm
// ---------------------------------------------------------------------------

export interface CpxMovie {
  id: string
  title: string
  originalTitle: string
  /** Jahr des Kinostarts in Österreich. */
  year: number | null
  /** Teil der Film-Adresse auf cineplexx.at */
  slug: string | null
  cinemaIds: string[]
}

interface RawMovie {
  id: string
  title?: string
  titleCalculated?: string
  titleOriginalCalculated?: string
  openingDate?: string | null
  shortURL?: string | null
  cinemaIds?: string[] | null
}

const PROGRAMME_KEY = "filmio.cpx.programme"
const PROGRAMME_TTL = 6 * 3600 * 1000

function readProgramme(): { at: number; list: CpxMovie[] } | null {
  try {
    const c = JSON.parse(localStorage.getItem(PROGRAMME_KEY) || "null") as { at?: number; list?: CpxMovie[] } | null
    return c && typeof c.at === "number" && Array.isArray(c.list) ? { at: c.at, list: c.list } : null
  } catch {
    return null
  }
}

let programmePending: Promise<CpxMovie[]> | null = null

/** Alle Filme im Programm (Österreich). Einige Stunden zwischengespeichert, offline die letzte Fassung. */
export function loadProgramme(): Promise<CpxMovie[]> {
  const cached = readProgramme()
  if (cached && Date.now() - cached.at < PROGRAMME_TTL) return Promise.resolve(cached.list)
  programmePending ??= (async () => {
    try {
      const raw = await get<RawMovie[]>("/api/v2/movies?location=all")
      const list: CpxMovie[] = raw.map((m) => ({
        id: m.id,
        title: (m.titleCalculated ?? m.title ?? "").replace(/^\*+/, "").trim(),
        originalTitle: (m.titleOriginalCalculated ?? "").replace(/^\*+/, "").trim(),
        year: m.openingDate ? Number(m.openingDate.slice(0, 4)) || null : null,
        slug: m.shortURL ?? null,
        cinemaIds: (m.cinemaIds ?? []).map(String),
      }))
      try { localStorage.setItem(PROGRAMME_KEY, JSON.stringify({ at: Date.now(), list })) } catch { /* nur Cache */ }
      return list
    } catch (e) {
      if (cached) return cached.list
      throw e
    } finally {
      programmePending = null
    }
  })()
  return programmePending
}

/** Nur das, was sich gecacht schon sagen lässt (ohne Netz). */
export function cachedProgramme(): CpxMovie[] | null {
  return readProgramme()?.list ?? null
}

/** Für den Titelvergleich: klein, ohne Akzente, Satzzeichen und Leerzeichen. */
export function normTitle(t: string): string {
  return t.toLocaleLowerCase("de")
    .replace(/ß/g, "ss").replace(/&/g, "und")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]/g, "")
}

/**
 * Der passende Film im Kinoprogramm: gleicher (deutscher oder Original-)Titel und Kinostart-Jahr
 * höchstens ein Jahr vom TMDB-Jahr entfernt – damit z.B. ein „Resident Evil“ von 2002 nicht dem von 2026 zugeordnet wird.
 */
export function matchMovie(list: CpxMovie[], film: { title: string; year: number | null; originalTitle?: string }, cinemaId?: string): CpxMovie | null {
  const titles = new Set([normTitle(film.title), film.originalTitle ? normTitle(film.originalTitle) : ""].filter(Boolean))
  const hits = list.filter((m) =>
    (!cinemaId || m.cinemaIds.includes(cinemaId)) &&
    (titles.has(normTitle(m.title)) || (m.originalTitle && titles.has(normTitle(m.originalTitle)))) &&
    (film.year === null || m.year === null || Math.abs(m.year - film.year) <= 1))
  if (hits.length <= 1) return hits[0] ?? null
  return hits.sort((a, b) => Math.abs((a.year ?? 0) - (film.year ?? 0)) - Math.abs((b.year ?? 0) - (film.year ?? 0)))[0]
}

export function movieUrl(m: CpxMovie): string {
  return m.slug ? `${CINEPLEXX_WEB}/film/${encodeURIComponent(m.slug)}` : CINEPLEXX_WEB
}

// ---------------------------------------------------------------------------
// Vorstellungen
// ---------------------------------------------------------------------------

export interface CpxSession {
  sessionId: string
  cinemaId: string
  /** ISO mit Zeitzone, z.B. 2026-11-17T19:45:00+01:00 */
  showtime: string
  screen: string
  /** z.B. „2D“, „3D“, „OV (Englisch)“, „DOLBY ATMOS“ */
  tags: string[]
}

interface RawSession {
  sessionId: string
  cinemaId: string
  showtime: string
  screenName?: string
  technologies?: string[][]
}

const sessionCache = new Map<string, { at: number; list: CpxSession[] }>()

/** Vorstellungen eines Films in einem Kino (die nächsten Tage, wie „Alle Tage“ auf cineplexx.at). */
export async function loadSessions(movieId: string, cinemaId: string): Promise<CpxSession[]> {
  const key = `${movieId}|${cinemaId}`
  const hit = sessionCache.get(key)
  if (hit && Date.now() - hit.at < 10 * 60 * 1000) return hit.list
  const days = await get<{ date: string; sessions: RawSession[] }[]>(`/api/v2/movies/${encodeURIComponent(movieId)}/sessions?location=all&date=all`)
  const now = Date.now()
  const list = days.flatMap((d) => d.sessions)
    .filter((s) => String(s.cinemaId) === cinemaId && Date.parse(s.showtime) > now - 15 * 60 * 1000)
    .map((s) => ({
      sessionId: String(s.sessionId),
      cinemaId: String(s.cinemaId),
      showtime: s.showtime,
      screen: s.screenName ?? "",
      tags: [...new Set((s.technologies ?? []).flat().filter(Boolean))],
    }))
    .sort((a, b) => a.showtime.localeCompare(b.showtime))
  sessionCache.set(key, { at: Date.now(), list })
  return list
}

// ---------------------------------------------------------------------------
// Preise
// ---------------------------------------------------------------------------

export interface PriceArea {
  /** „Standard“, „Cinegold“, „Cinegold Deluxe“ … */
  name: string
  prices: { label: string; cents: number }[]
}

interface RawTicket {
  areaCategoryCode: string
  description: string
  priceInCents: number
  salesChannels: string[]
  displaySequence: number
  isPackageTicket?: boolean
  isRedemptionTicket?: boolean
  isComplimentaryTicket?: boolean
  isAvailableForLoyaltyMembersOnly?: boolean
  isThirdPartyMemberTicket?: boolean
}

/** Ticketpreise einer Vorstellung, nach Sitzbereich: Normalpreis, ermäßigt, Kind (online buchbar). */
export async function loadPrices(cinemaId: string, sessionId: string): Promise<PriceArea[]> {
  const base = `/api/v1/cinemas/${encodeURIComponent(cinemaId)}/sessions/${encodeURIComponent(sessionId)}`
  const [tickets, areas] = await Promise.all([
    get<RawTicket[]>(`${base}/tickets`),
    get<{ areaCategoryCode: string; displayName: string }[]>(`${base}/area-categories`).catch(() => []),
  ])
  const areaNames = new Map(areas.map((a) => [a.areaCategoryCode, a.displayName]))
  const kinds: { label: string; test: RegExp }[] = [
    { label: "Normal", test: /^normalpreis/i },
    { label: "Ermäßigt", test: /^erm(ä|ae)(ss|ß)igt/i },
    { label: "Kind", test: /^kind/i },
  ]
  const usable = tickets.filter((t) => t.salesChannels?.includes("WWW") && !t.isPackageTicket && !t.isRedemptionTicket &&
    !t.isComplimentaryTicket && !t.isAvailableForLoyaltyMembersOnly && !t.isThirdPartyMemberTicket)
  const out: PriceArea[] = []
  const codes = [...new Set(usable.map((t) => t.areaCategoryCode))]
    // Nur Bereiche, die es in diesem Saal gibt (falls bekannt); Standard zuerst.
    .filter((c) => areaNames.size === 0 || areaNames.has(c))
    .sort()
  for (const code of codes) {
    const inArea = usable.filter((t) => t.areaCategoryCode === code).sort((a, b) => a.displaySequence - b.displaySequence)
    const prices: PriceArea["prices"] = []
    for (const k of kinds) {
      const t = inArea.find((x) => k.test.test(x.description.trim()))
      if (t) prices.push({ label: k.label, cents: t.priceInCents })
    }
    if (prices.length) out.push({ name: areaNames.get(code) ?? (code === "0000000001" ? "Standard" : "Weitere Plätze"), prices })
  }
  return out
}

export function formatEuro(cents: number): string {
  return (cents / 100).toLocaleString("de-AT", { style: "currency", currency: "EUR" })
}
