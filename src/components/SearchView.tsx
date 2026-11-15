import { useCallback, useEffect, useRef, useState, type FormEvent } from "react"
import type { Film } from "../types"
import { hasToken, loadFilmInfo, searchMovies, yearFromDate, type TmdbSearchResult } from "../lib/tmdb"
import { newFilm } from "../lib/storage"
import { formatRating } from "../lib/format"
import FilmCard from "./FilmCard"
import ViewHeader from "./ViewHeader"
import { IconCheck, IconPlus, IconSearch } from "./Icons"
import { useOnline } from "../hooks/useOnline"

interface Props {
  films: Film[]
  onAddToWatchlist: (film: Film) => void
  onRate: (film: Film) => void
  onOpenDetail: (film: Film, saved: boolean) => void
  /** Fehler bei Aktionen auf einem Treffer (als Toast, da die Karte weit unten sein kann). */
  onError: (message: string) => void
}

const DEBOUNCE_MS = 450

export default function SearchView({ films, onAddToWatchlist, onRate, onOpenDetail, onError }: Props) {
  const online = useOnline()
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<TmdbSearchResult[] | null>(null)
  const [searchedFor, setSearchedFor] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<number | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  /** Zuletzt erfolgreich gesuchter Begriff – verhindert doppelte Anfragen (Enter + Debounce). */
  const lastQueryRef = useRef("")

  const savedById = new Map(films.map((f) => [f.tmdbId, f]))

  const runSearch = useCallback(async (q: string) => {
    const trimmed = q.trim()
    abortRef.current?.abort()
    if (!trimmed) {
      setResults(null)
      setSearchedFor("")
      lastQueryRef.current = ""
      setError(null)
      setLoading(false)
      return
    }
    if (!online || trimmed === lastQueryRef.current) return
    const controller = new AbortController()
    abortRef.current = controller
    setLoading(true)
    setError(null)
    try {
      const found = await searchMovies(trimmed, controller.signal)
      if (controller.signal.aborted) return
      setResults(found)
      setSearchedFor(trimmed)
      lastQueryRef.current = trimmed
    } catch (e) {
      if (controller.signal.aborted) return
      lastQueryRef.current = ""
      setError(e instanceof Error ? e.message : "Suche fehlgeschlagen.")
    } finally {
      if (abortRef.current === controller) setLoading(false)
    }
  }, [online])

  // Live-Suche mit Verzögerung beim Tippen.
  useEffect(() => {
    if (!hasToken) return
    const t = setTimeout(() => { void runSearch(query) }, query.trim() ? DEBOUNCE_MS : 0)
    return () => clearTimeout(t)
  }, [query, runSearch])

  useEffect(() => () => abortRef.current?.abort(), [])

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    void runSearch(query)
  }

  /** Lädt Details (Genres, Laufzeit, Overview) und ruft dann die Aktion auf. */
  async function withDetails(id: number, action: (film: Film) => void) {
    if (busyId !== null) return
    setBusyId(id)
    try {
      const info = await loadFilmInfo(id)
      action(newFilm(info))
    } catch (e) {
      onError(`Filmdetails konnten nicht geladen werden. ${e instanceof Error ? e.message : ""}`.trim())
    } finally {
      setBusyId(null)
    }
  }

  return (
    <section className="view" aria-labelledby="search-heading">
      <ViewHeader id="search-heading" title="Suche">
        <form role="search" onSubmit={onSubmit}>
          <label className="search-field">
            <IconSearch />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filmtitel"
              aria-label="Film bei TMDB suchen"
              enterKeyHint="search"
              autoComplete="off"
              disabled={!hasToken}
            />
          </label>
        </form>
      </ViewHeader>

      {!hasToken && (
        <p className="notice notice-error">
          Kein TMDB-Token konfiguriert. Lege eine <code>.env</code> mit <code>VITE_TMDB_TOKEN</code> an
          (bzw. das GitHub-Secret) und baue die App neu.
        </p>
      )}
      {!online && <p className="notice notice-offline">Offline – Suche braucht Internet</p>}
      {error && <p className="notice notice-error" role="alert">{error}</p>}
      {loading && <p className="hint search-loading" aria-live="polite">Suche läuft …</p>}

      {results && !loading && results.length === 0 && (
        <p className="empty">Keine Treffer für „{searchedFor}“.</p>
      )}

      {results && results.length > 0 && (
        <div className="grid">
          {results.map((r) => {
            const saved = savedById.get(r.id)
            const year = yearFromDate(r.release_date)
            const busy = busyId === r.id
            const badge = saved
              ? saved.status === "watched"
                ? saved.rating !== null ? `✓ Gesehen · ★ ${formatRating(saved.rating)}` : "Früher gesehen"
                : "Auf der Watchlist"
              : busy ? "lädt …" : undefined
            return (
              <FilmCard
                key={r.id}
                title={r.title || r.original_title || "Unbekannter Titel"}
                year={year}
                posterPath={r.poster_path}
                badge={badge}
                onOpen={() => (saved ? onOpenDetail(saved, true) : void withDetails(r.id, (f) => onOpenDetail(f, false)))}
              >
                {!saved && (
                  <button type="button" className="pill" disabled={busyId !== null}
                    onClick={() => void withDetails(r.id, onAddToWatchlist)} aria-label={`${r.title} auf die Watchlist`}>
                    <IconPlus />Watchlist
                  </button>
                )}
                {(!saved || saved.status === "watchlist") && (
                  <button type="button" className="pill pill-accent" disabled={busyId !== null}
                    onClick={() => (saved ? onRate(saved) : void withDetails(r.id, onRate))} aria-label={`${r.title} als gesehen bewerten`}>
                    <IconCheck />Gesehen
                  </button>
                )}
              </FilmCard>
            )
          })}
        </div>
      )}

    </section>
  )
}
