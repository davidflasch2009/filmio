import { useMemo, useState } from "react"
import type { Film } from "../types"
import { normalizeText } from "../lib/format"
import FilmCard from "./FilmCard"
import ViewHeader from "./ViewHeader"
import { IconSearch } from "./Icons"

interface Props {
  films: Film[]
  onOpen: (film: Film) => void
  onFindFilms: () => void
}

/** Filme, die du vor langer Zeit gesehen hast und nicht mehr bewerten kannst (gesehen, ohne Bewertung). */
export default function EarlierView({ films, onOpen, onFindFilms }: Props) {
  const [query, setQuery] = useState("")

  const earlier = useMemo(
    () => films
      .filter((f) => f.status === "watched" && f.rating === null)
      .sort((a, b) => a.title.localeCompare(b.title, "de", { sensitivity: "base" })),
    [films],
  )
  const q = normalizeText(query.trim())
  const visible = q ? earlier.filter((f) => normalizeText(f.title).includes(q)) : earlier

  return (
    <section className="view" aria-labelledby="earlier-heading">
      <ViewHeader id="earlier-heading" title="Früher gesehen">
        {earlier.length > 0 && (
          <label className="search-field">
            <IconSearch />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="In „Früher gesehen“ suchen"
              aria-label="In früher gesehenen Filmen suchen"
              autoComplete="off"
            />
          </label>
        )}
      </ViewHeader>

      {earlier.length === 0 ? (
        <div className="empty">
          <p>Filme, die zu lange her sind, um sie zu bewerten.</p>
          <button type="button" className="btn btn-primary" onClick={onFindFilms}>Film suchen</button>
        </div>
      ) : visible.length === 0 ? (
        <p className="empty">Keine Treffer.</p>
      ) : (
        <div className="grid">
          {visible.map((f) => (
            <FilmCard key={f.tmdbId} title={f.title} year={f.year} posterPath={f.posterPath} onOpen={() => onOpen(f)} />
          ))}
        </div>
      )}
    </section>
  )
}
