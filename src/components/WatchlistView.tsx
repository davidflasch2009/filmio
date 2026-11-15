import { useMemo } from "react"
import type { Film } from "../types"
import FilmCard from "./FilmCard"

interface Props {
  films: Film[]
  onOpen: (film: Film) => void
  onMarkWatched: (film: Film) => void
}

export default function WatchlistView({ films, onOpen, onMarkWatched }: Props) {
  // Neueste zuerst.
  const list = useMemo(
    () => films
      .filter((f) => f.status === "watchlist")
      .sort((a, b) => (Date.parse(b.addedAt) || 0) - (Date.parse(a.addedAt) || 0)),
    [films],
  )

  return (
    <section className="view" aria-labelledby="watchlist-heading">
      <h1 id="watchlist-heading" className="view-title">Watchlist <span className="view-count">{list.length}</span></h1>

      {list.length === 0 ? (
        <p className="empty">Deine Watchlist ist leer. Such einen Film und tippe „＋ Watchlist“.</p>
      ) : (
        <div className="grid">
          {list.map((f) => (
            <FilmCard key={f.tmdbId} title={f.title} year={f.year} posterPath={f.posterPath} onOpen={() => onOpen(f)}>
              <button type="button" className="btn btn-small btn-primary" onClick={() => onMarkWatched(f)}>
                Als gesehen markieren
              </button>
            </FilmCard>
          ))}
        </div>
      )}
    </section>
  )
}
