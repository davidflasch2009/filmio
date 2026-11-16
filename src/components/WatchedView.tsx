import { useMemo, useState } from "react"
import type { Film } from "../types"
import { formatRating, normalizeText } from "../lib/format"
import FilmCard from "./FilmCard"
import FilterChip from "./FilterChip"
import ViewHeader from "./ViewHeader"
import SearchField from "./SearchField"
import { IconNote } from "./Icons"

type SortKey = "rating-desc" | "rating-asc" | "added-desc" | "watched-desc" | "title"

const SORTS: { value: SortKey; label: string }[] = [
  { value: "rating-desc", label: "Bewertung ↓" },
  { value: "rating-asc", label: "Bewertung ↑" },
  { value: "added-desc", label: "Zuletzt hinzugefügt" },
  { value: "watched-desc", label: "Zuletzt gesehen" },
  { value: "title", label: "Titel A–Z" },
]

/** Markierung für Bewertungen, die aus den eigenen Notizen übernommen wurden. */
const NOTES_MARKER = { icon: <IconNote />, label: "Bewertung aus meinen Notizen" }

interface Props {
  films: Film[]
  onOpen: (film: Film) => void
  onFindFilms: () => void
}

const byTitle = (a: Film, b: Film) => a.title.localeCompare(b.title, "de", { sensitivity: "base" })
const time = (iso: string | null) => (iso ? Date.parse(iso) || 0 : 0)

export default function WatchedView({ films, onOpen, onFindFilms }: Props) {
  const [sort, setSort] = useState<SortKey>("rating-desc")
  const [genre, setGenre] = useState("")
  const [minRating, setMinRating] = useState(0)
  const [query, setQuery] = useState("")
  /** Nur Filme zeigen, deren Bewertung aus den eigenen Notizen stammt. */
  const [notesOnly, setNotesOnly] = useState(false)

  // Gesehene Filme ohne Bewertung stehen im Tab „Früher“.
  const watched = useMemo(() => films.filter((f) => f.status === "watched" && f.rating !== null), [films])
  const genres = useMemo(
    () => [...new Set(watched.flatMap((f) => f.genres))].sort((a, b) => a.localeCompare(b, "de")),
    [watched],
  )

  const minOptions = [
    { value: 0, label: "Alle Sterne" },
    { value: 5, label: "★ 5" },
    ...[4.5, 4, 3.5, 3, 2, 1].map((r) => ({ value: r, label: `ab ★ ${formatRating(r).replace(",0", "")}` })),
  ]

  const visible = useMemo(() => {
    const q = normalizeText(query.trim())
    const list = watched.filter((f) =>
      (!genre || f.genres.includes(genre)) &&
      (f.rating ?? 0) >= minRating &&
      (!notesOnly || f.fromNotes) &&
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
  }, [watched, sort, genre, minRating, query, notesOnly])
  const notesCount = watched.filter((f) => f.fromNotes).length
  // Gibt es keine solchen Filme mehr, verschwindet der Umschalter – dann darf der Filter nicht hängen bleiben.
  if (notesOnly && notesCount === 0) setNotesOnly(false)

  const filtered = genre !== "" || minRating !== 0 || query.trim() !== "" || notesOnly

  function resetFilters() {
    setGenre("")
    setMinRating(0)
    setQuery("")
    setNotesOnly(false)
  }

  return (
    <section className="view" aria-labelledby="watched-heading">
      <ViewHeader id="watched-heading" title="Gesehen">
        {watched.length > 0 && (
          <>
            <SearchField value={query} onChange={setQuery} placeholder="In „Gesehen“ suchen" ariaLabel="In gesehenen Filmen suchen" />
            <div className="chips">
              <FilterChip id="watched-sort" label="Sortieren" options={SORTS} value={sort} onChange={setSort} active={sort !== "rating-desc"} />
              <FilterChip
                id="watched-genre"
                label="Genre"
                options={[{ value: "", label: "Alle Genres" }, ...genres.map((g) => ({ value: g, label: g }))]}
                value={genre}
                onChange={setGenre}
                active={genre !== ""}
                idleLabel="Genre"
              />
              <FilterChip id="watched-rating" label="Bewertung" options={minOptions} value={minRating} onChange={setMinRating} active={minRating !== 0} idleLabel="Sterne" />
              {notesCount > 0 && (
                <button
                  type="button"
                  className={`chip chip-toggle${notesOnly ? " chip-active" : ""}`}
                  aria-pressed={notesOnly}
                  onClick={() => setNotesOnly((v) => !v)}
                >
                  <IconNote /><span className="chip-text">Aus Notizen</span>
                </button>
              )}
            </div>
          </>
        )}
      </ViewHeader>

      {watched.length === 0 ? (
        <div className="empty">
          <p>Noch keine gesehenen Filme.</p>
          <button type="button" className="btn btn-primary" onClick={onFindFilms}>Film suchen</button>
        </div>
      ) : (
        <>
          {filtered && (
            <p className="filter-info">
              {visible.length} von {watched.length} Filmen ·{" "}
              <button type="button" className="text-btn text-btn-inline" onClick={resetFilters}>Filter zurücksetzen</button>
            </p>
          )}
          {visible.length === 0 ? (
            <p className="empty">Keine Filme passen zu Suche oder Filter.</p>
          ) : (
            <div className="grid">
              {visible.map((f) => (
                <FilmCard
                  key={f.tmdbId}
                  title={f.title}
                  year={f.year}
                  posterPath={f.posterPath}
                  rating={f.rating}
                  marker={f.fromNotes ? NOTES_MARKER : undefined}
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
