import type { Answer, Film, FilmInfo, Status, Store } from "../types"
import { QUESTIONS } from "./scoring"
import { localDateStamp } from "./format"

export const STORAGE_KEY = "filmio.v1"
/** Hier landen nicht lesbare Rohdaten, bevor sie überschrieben werden könnten. */
export const CORRUPT_BACKUP_KEY = "filmio.v1.corrupt-backup"

export type ImportMode = "merge" | "replace"

export interface ImportResult {
  store: Store
  mode: ImportMode
  added: number
  updated: number
  total: number
}

function emptyStore(): Store {
  return { version: 1, films: [] }
}

// ---------------------------------------------------------------------------
// Validierung
// ---------------------------------------------------------------------------

const ANSWERS: readonly Answer[] = ["ja", "neutral", "nein"]
const STATUSES: readonly Status[] = ["watched", "watchlist"]

const isObject = (x: unknown): x is Record<string, unknown> =>
  typeof x === "object" && x !== null && !Array.isArray(x)
const isNullableString = (x: unknown): x is string | null => x === null || typeof x === "string"
const isIsoDate = (x: unknown): x is string => typeof x === "string" && !Number.isNaN(Date.parse(x))

type FilmCheck = { ok: true; film: Film } | { ok: false; error: string }

/** Prüft einen Eintrag auf plausible Film-Shape und gibt eine bereinigte Kopie zurück. */
function checkFilm(x: unknown): FilmCheck {
  const fail = (field: string, expected: string): FilmCheck =>
    ({ ok: false, error: `Feld „${field}“ ist ungültig (erwartet: ${expected}).` })

  if (!isObject(x)) return { ok: false, error: "Eintrag ist kein Objekt." }
  const f = x

  if (typeof f.tmdbId !== "number" || !Number.isInteger(f.tmdbId) || f.tmdbId <= 0)
    return fail("tmdbId", "positive ganze Zahl")
  if (typeof f.title !== "string" || f.title.trim() === "") return fail("title", "Text")
  if (!(f.year === null || (typeof f.year === "number" && Number.isInteger(f.year))))
    return fail("year", "Jahreszahl oder null")
  if (!isNullableString(f.posterPath)) return fail("posterPath", "Text oder null")
  if (!Array.isArray(f.genres) || !f.genres.every((g) => typeof g === "string"))
    return fail("genres", "Liste von Texten")
  if (typeof f.overview !== "string") return fail("overview", "Text")
  if (!(f.runtime === null || (typeof f.runtime === "number" && Number.isFinite(f.runtime) && f.runtime >= 0)))
    return fail("runtime", "Minuten oder null")
  if (typeof f.status !== "string" || !STATUSES.includes(f.status as Status))
    return fail("status", "„watched“ oder „watchlist“")
  if (!(f.rating === null || (typeof f.rating === "number" && f.rating >= 0.5 && f.rating <= 5 && Number.isInteger(f.rating * 2))))
    return fail("rating", "0,5–5,0 in 0,5er-Schritten oder null")
  if (!(f.answers === null || (Array.isArray(f.answers) && f.answers.length === QUESTIONS.length &&
      f.answers.every((a) => ANSWERS.includes(a as Answer)))))
    return fail("answers", `${QUESTIONS.length} Antworten (ja/neutral/nein) oder null`)
  if (typeof f.note !== "string") return fail("note", "Text")
  if (!isIsoDate(f.addedAt)) return fail("addedAt", "ISO-Datum")
  if (!(f.watchedAt === null || isIsoDate(f.watchedAt))) return fail("watchedAt", "ISO-Datum oder null")
  // Später ergänztes Feld: fehlt es (ältere Backups), gilt false.
  if (!(f.fromNotes === undefined || typeof f.fromNotes === "boolean")) return fail("fromNotes", "true/false")
  if (!(f.backdropPath === undefined || isNullableString(f.backdropPath))) return fail("backdropPath", "Text oder null")
  if (!(f.updatedAt === undefined || isIsoDate(f.updatedAt))) return fail("updatedAt", "ISO-Datum")

  return {
    ok: true,
    film: {
      tmdbId: f.tmdbId,
      title: f.title,
      year: f.year,
      posterPath: f.posterPath,
      genres: [...(f.genres as string[])],
      overview: f.overview,
      runtime: f.runtime,
      status: f.status as Status,
      rating: f.rating,
      answers: f.answers === null ? null : [...(f.answers as Answer[])],
      note: f.note,
      addedAt: f.addedAt,
      watchedAt: f.watchedAt,
      fromNotes: f.fromNotes ?? false,
      // Fehlt das Feld, holt die App das Szenenbild später nach.
      ...(f.backdropPath === undefined ? {} : { backdropPath: f.backdropPath }),
      ...(f.updatedAt === undefined ? {} : { updatedAt: f.updatedAt }),
    },
  }
}

/** Lösch-Marker (tmdbId → ISO-Datum); ungültige Einträge werden still verworfen. */
function checkDeleted(x: unknown): Record<string, string> | undefined {
  if (!isObject(x)) return undefined
  const out: Record<string, string> = {}
  for (const [id, at] of Object.entries(x)) {
    if (/^\d+$/.test(id) && isIsoDate(at)) out[id] = at
  }
  return Object.keys(out).length ? out : undefined
}

/** Store mit neuer Filmliste; Lösch-Marker bleiben erhalten. */
function withFilms(store: Store, films: Film[], deleted: Record<string, string> | undefined = store.deleted): Store {
  return deleted && Object.keys(deleted).length ? { version: 1, films, deleted } : { version: 1, films }
}

/** Zeitpunkt der letzten Änderung eines Films (ältere Einträge haben noch kein updatedAt). */
export function changedAt(film: Film): string {
  return film.updatedAt ?? film.watchedAt ?? film.addedAt
}

/** Entfernt doppelte tmdbIds (der spätere Eintrag gewinnt, Position des ersten bleibt). */
function dedupe(films: Film[]): Film[] {
  const map = new Map<number, Film>()
  for (const film of films) map.set(film.tmdbId, film)
  return [...map.values()]
}

/** Strikte Validierung (für Import): wirft eine verständliche Fehlermeldung. */
export function validateStore(data: unknown): Store {
  if (!isObject(data)) throw new Error("Die Datei enthält kein filmio-Backup (kein JSON-Objekt).")
  if (!("version" in data)) throw new Error("Die Datei ist kein filmio-Backup (Feld „version“ fehlt).")
  if (data.version !== 1)
    throw new Error(`Nicht unterstützte Backup-Version „${String(data.version)}“ (erwartet: 1).`)
  if (!Array.isArray(data.films)) throw new Error("Ungültiges Backup: „films“ ist keine Liste.")

  const films: Film[] = []
  data.films.forEach((entry, i) => {
    const check = checkFilm(entry)
    if (!check.ok) {
      const title = isObject(entry) && typeof entry.title === "string" ? ` („${entry.title}“)` : ""
      throw new Error(`Ungültiger Eintrag Nr. ${i + 1}${title}: ${check.error}`)
    }
    films.push(check.film)
  })
  return { version: 1, films: dedupe(films) }
}

// ---------------------------------------------------------------------------
// Laden & Speichern
// ---------------------------------------------------------------------------

function backupCorrupt(raw: string) {
  try {
    localStorage.setItem(CORRUPT_BACKUP_KEY, raw)
  } catch {
    // Kein Platz für ein Backup – dann eben nicht.
  }
}

/** Liest den Store. Defekte Daten werden gesichert und, soweit möglich, gerettet. */
export function load(): Store {
  let raw: string | null
  try {
    raw = localStorage.getItem(STORAGE_KEY)
  } catch {
    return emptyStore()
  }
  if (!raw) return emptyStore()

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    backupCorrupt(raw)
    return emptyStore()
  }
  if (!isObject(parsed) || parsed.version !== 1 || !Array.isArray(parsed.films)) {
    backupCorrupt(raw)
    return emptyStore()
  }

  const store = parseStore(parsed)
  if (!store || store.films.length !== parsed.films.length) backupCorrupt(raw)
  return store ?? emptyStore()
}

/** Nachsichtiges Einlesen (lokaler Speicher, Daten vom Server): ungültige Filme werden übersprungen. */
export function parseStore(data: unknown): Store | null {
  if (!isObject(data) || data.version !== 1 || !Array.isArray(data.films)) return null
  const films: Film[] = []
  for (const entry of data.films) {
    const check = checkFilm(entry)
    if (check.ok) films.push(check.film)
  }
  return withFilms(emptyStore(), dedupe(films), checkDeleted(data.deleted))
}

type ChangeListener = (store: Store) => void
const listeners = new Set<ChangeListener>()

/** Meldet jede eigene Änderung (nicht die vom Abgleich übernommenen). */
export function onLocalChange(fn: ChangeListener): () => void {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}

/** Speichert den Store. `silent`: Änderung kam vom Abgleich und muss nicht wieder hochgeladen werden. */
export function save(store: Store, { silent = false }: { silent?: boolean } = {}): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
    if (!silent) listeners.forEach((fn) => fn(store))
  } catch (e) {
    const quota = e instanceof DOMException && (e.name === "QuotaExceededError" || e.code === 22)
    throw new Error(quota
      ? "Speicher voll – Daten konnten nicht gespeichert werden."
      : "Daten konnten nicht gespeichert werden (Browser-Speicher nicht verfügbar).")
  }
}

// ---------------------------------------------------------------------------
// CRUD (eindeutig über tmdbId). Jede Funktion speichert und gibt den neuen Store zurück.
// ---------------------------------------------------------------------------

/** Neuer Film-Eintrag aus TMDB-Daten. */
export function newFilm(info: FilmInfo, status: Status = "watchlist"): Film {
  return {
    ...info,
    status,
    rating: null,
    answers: null,
    note: "",
    addedAt: new Date().toISOString(),
    watchedAt: null,
    fromNotes: false,
  }
}

const nowIso = () => new Date().toISOString()

/** Lösch-Marker ohne die angegebenen Filme (sie sind wieder da). */
function withoutDeleted(deleted: Record<string, string> | undefined, ids: Iterable<number>): Record<string, string> | undefined {
  if (!deleted) return undefined
  const next = { ...deleted }
  for (const id of ids) delete next[id]
  return next
}

/** Fügt einen Film hinzu. Existiert die tmdbId schon, wird der Eintrag ersetzt (addedAt bleibt). */
export function addFilm(film: Film): Store {
  const store = load()
  const stamped: Film = { ...film, updatedAt: nowIso() }
  const existing = store.films.find((f) => f.tmdbId === film.tmdbId)
  const films = existing
    ? store.films.map((f) => (f.tmdbId === film.tmdbId ? { ...stamped, addedAt: existing.addedAt } : f))
    : [...store.films, stamped]
  const next = withFilms(store, films, withoutDeleted(store.deleted, [film.tmdbId]))
  save(next)
  return next
}

/**
 * Ändert einen Film. `touch: false` für automatische Ergänzungen (z.B. nachgeladenes Szenenbild):
 * die zählen beim Abgleich nicht als Änderung und überschreiben so keine Bewertung von einem anderen Gerät.
 */
export function updateFilm(tmdbId: number, patch: Partial<Omit<Film, "tmdbId">>, { touch = true }: { touch?: boolean } = {}): Store {
  const store = load()
  const stamp = touch ? { updatedAt: nowIso() } : {}
  const next = withFilms(store, store.films.map((f) => (f.tmdbId === tmdbId ? { ...f, ...patch, ...stamp, tmdbId } : f)))
  save(next)
  return next
}

export function removeFilm(tmdbId: number): Store {
  const store = load()
  const next = withFilms(store, store.films.filter((f) => f.tmdbId !== tmdbId), { ...store.deleted, [tmdbId]: nowIso() })
  save(next)
  return next
}

export function getByStatus(status: Status, store: Store = load()): Film[] {
  return store.films.filter((f) => f.status === status)
}

// ---------------------------------------------------------------------------
// Export / Import
// ---------------------------------------------------------------------------

export function backupFileName(date: Date = new Date()): string {
  return `filmio-backup-${localDateStamp(date)}.json`
}

/** Lädt den kompletten Store als JSON-Datei herunter. */
export function exportJson(): void {
  const store = load()
  const blob = new Blob([JSON.stringify(store, null, 2)], { type: "application/json" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = backupFileName()
  a.style.display = "none"
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Etwas warten, damit der Download sicher gestartet ist.
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

const MAX_IMPORT_BYTES = 20 * 1024 * 1024

/** Liest + validiert ein Backup. Bei Fehlern wird nichts verändert. */
export async function importJson(file: File, mode: ImportMode = "merge"): Promise<ImportResult> {
  if (file.size > MAX_IMPORT_BYTES) throw new Error("Die Datei ist zu groß für ein filmio-Backup.")

  let text: string
  try {
    text = await file.text()
  } catch {
    throw new Error("Die Datei konnte nicht gelesen werden.")
  }

  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error("Die Datei ist kein gültiges JSON.")
  }

  // Importierte Filme gelten als gerade geändert – so setzen sie sich auch auf den anderen Geräten durch.
  const now = nowIso()
  const valid = validateStore(data)
  const incoming: Store = { version: 1, films: valid.films.map((f) => ({ ...f, updatedAt: now })) }
  const current = load()

  if (mode === "replace") {
    // Was nicht im Backup steht, ist gelöscht – auch auf den anderen Geräten.
    const keep = new Set(incoming.films.map((f) => f.tmdbId))
    const deleted = withoutDeleted(current.deleted, keep) ?? {}
    for (const f of current.films) if (!keep.has(f.tmdbId)) deleted[f.tmdbId] = now
    const next = withFilms(incoming, incoming.films, deleted)
    save(next)
    return { store: next, mode, added: incoming.films.length, updated: 0, total: incoming.films.length }
  }

  const incomingById = new Map(incoming.films.map((f) => [f.tmdbId, f]))
  let updated = 0
  const films = current.films.map((f) => {
    const replacement = incomingById.get(f.tmdbId)
    if (!replacement) return f
    updated++
    incomingById.delete(f.tmdbId)
    return replacement
  })
  const added = incomingById.size
  films.push(...incomingById.values())

  const next = withFilms(current, films, withoutDeleted(current.deleted, incoming.films.map((f) => f.tmdbId)))
  save(next)
  return { store: next, mode, added, updated, total: next.films.length }
}
