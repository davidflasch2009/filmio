import { useCallback, useEffect, useRef, useState, type FormEvent } from "react"
import type { Film, MyCinema } from "../types"
import type { CpxMovie } from "../lib/cineplexx"
import { cleanSearchResults, hasToken, loadList, searchMovies, searchPeople, smallImageUrl, yearFromDate, type TmdbListItem, type TmdbPerson, type TmdbSearchResult } from "../lib/tmdb"
import type { Region } from "../lib/settings"
import { GENRE_IDS } from "../lib/genres"
import FilmCard from "./FilmCard"
import ViewHeader from "./ViewHeader"
import SearchField from "./SearchField"
import BrowseView from "./BrowseView"
import { statusMarker } from "./statusMarker"
import { useOnline } from "../hooks/useOnline"

interface Props {
  films: Film[]
  region: Region
  /** true, solange der Such-Tab sichtbar ist (die Stöber-Reihen laden erst dann). */
  active: boolean
  /** Detailseite öffnen (gespeicherter Film oder Vorschau). */
  onOpenItem: (item: TmdbListItem) => void
  /** Seite einer Person (Schauspiel/Regie) öffnen. */
  onOpenPerson: (person: TmdbPerson) => void
  cinema: MyCinema | null
  programme: CpxMovie[] | null
}

const DEBOUNCE_MS = 450
/** Genre-Knöpfe unter dem Suchfeld (ohne „TV-Film“). */
const GENRES = Object.keys(GENRE_IDS).filter((g) => g !== "TV-Film")

interface Found { query: string; films: TmdbSearchResult[]; people: TmdbPerson[] }

export default function SearchView({ films, region, active, onOpenItem, onOpenPerson, cinema, programme }: Props) {
  const online = useOnline()
  const [query, setQuery] = useState("")
  const [found, setFound] = useState<Found | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /** Gewähltes Genre (nur ohne Suchbegriff) und seine Filme. */
  const [genre, setGenre] = useState<string | null>(null)
  const [genreFilms, setGenreFilms] = useState<{ genre: string; items: TmdbListItem[] } | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const lastQueryRef = useRef("")

  const savedById = new Map(films.map((f) => [f.tmdbId, f]))

  const runSearch = useCallback(async (q: string) => {
    const trimmed = q.trim()
    abortRef.current?.abort()
    if (!trimmed) {
      setFound(null)
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
      const [raw, people] = await Promise.all([
        searchMovies(trimmed, controller.signal),
        trimmed.length >= 3 ? searchPeople(trimmed, controller.signal).catch(() => []) : Promise.resolve([]),
      ])
      if (controller.signal.aborted) return
      setFound({ query: trimmed, films: cleanSearchResults(raw, trimmed), people })
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

  // Genre gewählt → beliebteste Filme des Genres.
  useEffect(() => {
    if (!genre || !online || !hasToken) return
    let cancelled = false
    loadList({ kind: "genre", genreId: GENRE_IDS[genre] }).then(
      (items) => { if (!cancelled) setGenreFilms({ genre, items }) },
      () => { if (!cancelled) setGenreFilms({ genre, items: [] }) },
    )
    return () => { cancelled = true }
  }, [genre, online])

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    void runSearch(query)
  }

  const searching = query.trim() !== ""
  const shownGenre = !searching && genre && genreFilms?.genre === genre ? genreFilms.items : null

  const grid = (items: TmdbListItem[]) => (
    <div className="grid">
      {items.map((r) => {
        const saved = savedById.get(r.id)
        return (
          <FilmCard
            key={r.id}
            title={r.title || r.original_title || "Unbekannter Titel"}
            year={yearFromDate(r.release_date)}
            posterPath={r.poster_path}
            rating={saved?.status === "watched" ? saved.rating : undefined}
            marker={statusMarker(saved)}
            onOpen={() => onOpenItem(r)}
          />
        )
      })}
    </div>
  )

  return (
    <section className="view" aria-labelledby="search-heading">
      <ViewHeader id="search-heading" title="Suche">
        <form role="search" onSubmit={onSubmit}>
          <SearchField value={query} onChange={setQuery} placeholder="Film, Schauspieler, Regie" ariaLabel="Film oder Person bei TMDB suchen" disabled={!hasToken} />
        </form>
        {!searching && hasToken && (
          <div className="chips genre-chips" role="group" aria-label="Genre">
            {GENRES.map((g) => (
              <button
                key={g}
                type="button"
                className={`chip chip-toggle${genre === g ? " chip-active" : ""}`}
                aria-pressed={genre === g}
                onClick={() => setGenre((cur) => (cur === g ? null : g))}
              >
                <span className="chip-text">{g}</span>
              </button>
            ))}
          </div>
        )}
      </ViewHeader>

      {!hasToken && (
        <p className="notice notice-error">
          Kein TMDB-Token konfiguriert. Lege eine <code>.env</code> mit <code>VITE_TMDB_TOKEN</code> an
          (bzw. das GitHub-Secret) und baue die App neu.
        </p>
      )}
      {!online && <p className="notice notice-offline">Offline – Suche braucht Internet</p>}
      {error && <p className="notice notice-error" role="alert">{error}</p>}
      {searching && loading && <p className="hint search-loading" aria-live="polite">Suche läuft …</p>}

      {searching && found && !loading && found.films.length === 0 && found.people.length === 0 && (
        <p className="empty">Keine Treffer für „{found.query}“.</p>
      )}

      {searching && found && found.people.length > 0 && (
        <section className="people" aria-label="Personen">
          <h2 className="section-title">Personen</h2>
          <ul className="people-row">
            {found.people.map((p) => (
              <li key={p.id}>
                <button type="button" className="person" onClick={() => onOpenPerson(p)}>
                  <img className="person-img" src={smallImageUrl(p.profile_path, "w185")!} alt="" loading="lazy" />
                  <span className="person-name">{p.name}</span>
                  <span className="person-role">{p.known_for_department === "Directing" ? "Regie" : "Schauspiel"}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {searching && found && found.films.length > 0 && (
        <section aria-label="Filme">
          {found.people.length > 0 && <h2 className="section-title">Filme</h2>}
          {grid(found.films)}
        </section>
      )}

      {!searching && genre && (shownGenre ? grid(shownGenre) : <p className="hint search-loading">Lade {genre} …</p>)}

      {/* Ohne Suchbegriff und Genre: Stöbern. Bleibt eingehängt, damit Scroll-Positionen erhalten bleiben. */}
      <div hidden={searching || genre !== null}>
        <BrowseView films={films} region={region} active={active} cinema={cinema} programme={programme} onOpenItem={onOpenItem} />
      </div>
    </section>
  )
}
