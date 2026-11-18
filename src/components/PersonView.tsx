import { useEffect, useRef, useState } from "react"
import type { Film } from "../types"
import { loadPersonFilms, smallImageUrl, yearFromDate, type TmdbListItem, type TmdbPerson } from "../lib/tmdb"
import { useSwipeBack } from "../hooks/useSwipeBack"
import FilmCard from "./FilmCard"
import { statusMarker } from "./statusMarker"
import { IconChevronLeft } from "./Icons"

interface Props {
  person: TmdbPerson
  films: Film[]
  onOpen: (item: TmdbListItem) => void
  onClose: () => void
}

/** Alle Filme einer Person – mit Markierung, welche du schon kennst. */
export default function PersonView({ person, films, onOpen, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  useSwipeBack(ref, onClose)
  const [list, setList] = useState<TmdbListItem[] | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    loadPersonFilms(person).then((l) => { if (!cancelled) setList(l) }, () => { if (!cancelled) setFailed(true) })
    return () => { cancelled = true }
  }, [person])

  const savedById = new Map(films.map((f) => [f.tmdbId, f]))
  const known = list?.filter((m) => savedById.get(m.id)?.status === "watched").length ?? 0
  const role = person.known_for_department === "Directing" ? "Regie" : "Schauspiel"

  return (
    <div className="overlay stats detail-enter" role="dialog" aria-modal="true" aria-label={person.name} ref={ref}>
      <header className="stats-head">
        <button type="button" className="round-btn" onClick={onClose} aria-label="Zurück"><IconChevronLeft /></button>
      </header>
      <div className="person-head">
        {person.profile_path && <img className="person-head-img" src={smallImageUrl(person.profile_path, "w185")!} alt="" />}
        <div>
          <h2 className="view-title person-head-name">{person.name}</h2>
          <p className="hint">{role}{list ? ` · ${list.length} Filme${known ? ` · ${known} gesehen` : ""}` : ""}</p>
        </div>
      </div>
      {failed && <p className="notice notice-error">Die Filme konnten nicht geladen werden.</p>}
      {!list && !failed && <p className="hint">Lade Filme …</p>}
      {list && (
        <div className="grid">
          {list.map((m) => {
            const saved = savedById.get(m.id)
            return (
              <FilmCard
                key={m.id}
                title={m.title || m.original_title || "Unbekannter Titel"}
                year={yearFromDate(m.release_date)}
                posterPath={m.poster_path}
                rating={saved?.status === "watched" ? saved.rating : undefined}
                marker={statusMarker(saved)}
                onOpen={() => onOpen(m)}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}
