import type { ReactNode } from "react"
import type { Film } from "../types"
import { yearFromDate, type TmdbListItem } from "../lib/tmdb"
import { Poster } from "./FilmCard"
import { IconBookmark, IconCheck, IconHistory } from "./Icons"

/** Kleines Symbol in der Poster-Ecke: Der Film ist schon in deiner Liste. */
export function StatusMarker({ film }: { film: Film | undefined }) {
  if (!film) return null
  const [icon, label] = film.status === "watchlist"
    ? [<IconBookmark key="i" />, "Auf der Watchlist"]
    : film.rating === null
      ? [<IconHistory key="i" />, "Früher gesehen"]
      : [<IconCheck key="i" />, "Gesehen"]
  return <span className="poster-marker" role="img" aria-label={label} title={label}>{icon}</span>
}

interface Props {
  title: string
  /** Kleine Zusatzinfo rechts neben der Überschrift. */
  note?: ReactNode
  /** undefined = lädt noch (Platzhalter). */
  items: TmdbListItem[] | undefined
  films: Film[]
  onOpen: (item: TmdbListItem) => void
  /** Titel und Jahr unter dem Poster zeigen (z.B. bei Filmreihen). */
  showTitles?: boolean
  /** Dieser Film ist der gerade geöffnete und nicht antippbar. */
  currentId?: number
  /** Überschriften-Ebene: h2 in den Tabs, h3 innerhalb der Detailseite. */
  level?: 2 | 3
  children?: ReactNode
}

/** Waagrecht scrollende Poster-Reihe mit Überschrift. */
export default function PosterRow({ title, note, items, films, onOpen, showTitles = false, currentId, level = 2, children }: Props) {
  const Heading = level === 2 ? "h2" : "h3"
  const savedById = new Map(films.map((f) => [f.tmdbId, f]))
  return (
    <section className="row">
      <div className="row-head">
        <Heading className="row-title">{title}</Heading>
        {note && <span className="row-note">{note}</span>}
      </div>
      <div className="row-scroll">
        {items === undefined
          ? Array.from({ length: 5 }, (_, i) => <div key={i} className="row-item"><div className="poster poster-thumb poster-skeleton" /></div>)
          : items.map((item) => {
            const name = item.title || item.original_title || "Unbekannter Titel"
            const year = yearFromDate(item.release_date)
            const current = item.id === currentId
            return (
              <button
                key={item.id}
                type="button"
                className={`row-item${current ? " row-item-current" : ""}`}
                onClick={() => onOpen(item)}
                disabled={current}
                aria-label={showTitles ? undefined : name}
                aria-current={current ? "true" : undefined}
              >
                <span className="poster-wrap">
                  <Poster path={item.poster_path} title={name} />
                  <StatusMarker film={savedById.get(item.id)} />
                </span>
                {showTitles && (
                  <span className="row-item-text">
                    <span className="row-item-title">{name}</span>
                    {year !== null && <span className="row-item-year">{year}</span>}
                  </span>
                )}
              </button>
            )
          })}
      </div>
      {children}
    </section>
  )
}
