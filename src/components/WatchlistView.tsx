import { useMemo } from "react"
import type { Film } from "../types"
import FilmCard from "./FilmCard"
import ViewHeader from "./ViewHeader"
import { IconCheck } from "./Icons"

interface Props {
  films: Film[]
  onOpen: (film: Film) => void
  onMarkWatched: (film: Film) => void
  onFindFilms: () => void
}

export default function WatchlistView({ films, onOpen, onMarkWatched, onFindFilms }: Props) {
  // Neueste zuerst.
  const list = useMemo(
    () => films
      .filter((f) => f.status === "watchlist")
      .sort((a, b) => (Date.parse(b.addedAt) || 0) - (Date.parse(a.addedAt) || 0)),
    [films],
  )

  return (
    <section className="view" aria-labelledby="watchlist-heading">
      <ViewHeader
        id="watchlist-heading"
        title="Watchlist"
        subtitle={list.length ? `${list.length} ${list.length === 1 ? "Film" : "Filme"}, die du sehen willst` : undefined}
      />

      {list.length === 0 ? (
        <div className="empty">
          <p>Deine Watchlist ist leer.</p>
          <button type="button" className="btn btn-primary" onClick={onFindFilms}>Film suchen</button>
        </div>
      ) : (
        <div className="grid">
          {list.map((f) => (
            <FilmCard key={f.tmdbId} title={f.title} year={f.year} posterPath={f.posterPath} onOpen={() => onOpen(f)}>
              <button type="button" className="pill pill-accent" onClick={() => onMarkWatched(f)} aria-label={`${f.title} als gesehen markieren`}>
                <IconCheck />Gesehen
              </button>
            </FilmCard>
          ))}
        </div>
      )}
    </section>
  )
}
