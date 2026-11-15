import { useMemo, useState } from "react"
import type { Film } from "../types"
import { normalizeText } from "../lib/format"
import FilmCard from "./FilmCard"

type SortKey = "rating-desc" | "rating-asc" | "added-desc" | "watched-desc" | "title"

const SORTS: { id: SortKey; label: string }[] = [
  { id: "rating-desc", label: "Bewertung ↓" },
  { id: "rating-asc", label: "Bewertung ↑" },
  { id: "added-desc", label: "Hinzugefügt am (neueste)" },
  { id: "watched-desc", label: "Gesehen am (neueste)" },
  { id: "title", label: "Titel A–Z" },
]

const MIN_RATINGS = [0, 1, 2, 3, 3.5, 4, 4.5, 5]
/** Spezialwert im Bewertungsfilter: nur Filme ohne Bewertung (z.B. importierte). */
const UNRATED = -1

interface Props {
  films: Film[]
  onOpen: (film: Film) => void
}

const byTitle = (a: Film, b: Film) => a.title.localeCompare(b.title, "de", { sensitivity: "base" })
const time = (iso: string | null) => (iso ? Date.parse(iso) || 0 : 0)

export default function WatchedView({ films, onOpen }: Props) {
  const [sort, setSort] = useState<SortKey>("rating-desc")
  const [genre, setGenre] = useState("")
  const [minRating, setMinRating] = useState(0)
  const [query, setQuery] = useState("")

  const watched = useMemo(() => films.filter((f) => f.status === "watched"), [films])
  const genres = useMemo(
    () => [...new Set(watched.flatMap((f) => f.genres))].sort((a, b) => a.localeCompare(b, "de")),
    [watched],
  )

  const visible = useMemo(() => {
    const q = normalizeText(query.trim())
    const list = watched.filter((f) =>
      (!genre || f.genres.includes(genre)) &&
      (minRating === UNRATED ? f.rating === null : (f.rating ?? 0) >= minRating) &&
      (!q || normalizeText(f.title).includes(q) || normalizeText(f.note).includes(q)))

    const sorted = [...list]
    switch (sort) {
      case "rating-desc":
        sorted.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0) || byTitle(a, b))
        break
      case "rating-asc":
        sorted.sort((a, b) => (a.rating ?? 0) - (b.rating ?? 0) || byTitle(a, b))
        break
      case "added-desc":
        sorted.sort((a, b) => time(b.addedAt) - time(a.addedAt) || byTitle(a, b))
        break
      case "watched-desc":
        sorted.sort((a, b) => time(b.watchedAt) - time(a.watchedAt) || byTitle(a, b))
        break
      case "title":
        sorted.sort(byTitle)
        break
    }
    return sorted
  }, [watched, sort, genre, minRating, query])

  const filtered = genre !== "" || minRating !== 0 || query.trim() !== ""
  const unratedCount = watched.filter((f) => f.rating === null).length

  function resetFilters() {
    setGenre("")
    setMinRating(0)
    setQuery("")
  }

  return (
    <section className="view" aria-labelledby="watched-heading">
      <h1 id="watched-heading" className="view-title">Gesehen <span className="view-count">{watched.length}</span></h1>

      {watched.length === 0 ? (
        <p className="empty">Noch keine gesehenen Filme. Such einen Film und tippe „✓ Gesehen“.</p>
      ) : (
        <>
          <div className="toolbar">
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="In „Gesehen“ suchen …"
              aria-label="In gesehenen Filmen suchen"
            />
            <div className="toolbar-row">
              <label className="select">
                <span>Sortieren</span>
                <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
                  {SORTS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                </select>
              </label>
              <label className="select">
                <span>Genre</span>
                <select value={genre} onChange={(e) => setGenre(e.target.value)}>
                  <option value="">Alle Genres</option>
                  {genres.map((g) => <option key={g} value={g}>{g}</option>)}
                </select>
              </label>
              <label className="select">
                <span>Bewertung</span>
                <select value={minRating} onChange={(e) => setMinRating(Number(e.target.value))}>
                  {MIN_RATINGS.map((r) => (
                    <option key={r} value={r}>{r === 0 ? "Alle" : r === 5 ? "★ 5" : `ab ★ ${String(r).replace(".", ",")}`}</option>
                  ))}
                  <option value={UNRATED}>Nicht bewertet ({unratedCount})</option>
                </select>
              </label>
            </div>
          </div>

          {filtered && (
            <p className="hint">
              {visible.length} von {watched.length} Filmen ·{" "}
              <button type="button" className="btn-link" onClick={resetFilters}>Filter zurücksetzen</button>
            </p>
          )}

          {visible.length === 0 ? (
            <p className="empty">Keine Filme passen zu Suche/Filter.</p>
          ) : (
            <div className="grid">
              {visible.map((f) => (
                <FilmCard
                  key={f.tmdbId}
                  title={f.title}
                  year={f.year}
                  posterPath={f.posterPath}
                  rating={f.rating}
                  badge={f.rating === null ? "Noch nicht bewertet" : undefined}
                  onOpen={() => onOpen(f)}
                />
              ))}
            </div>
          )}
        </>
      )}
    </section>
  )
}
