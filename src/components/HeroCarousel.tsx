import { useEffect, useRef, useState } from "react"
import type { Film } from "../types"
import { backdropUrl, yearFromDate, type TmdbListItem } from "../lib/tmdb"
import { StatusMarker } from "./PosterRow"

interface Props {
  items: TmdbListItem[]
  films: Film[]
  onOpen: (item: TmdbListItem) => void
}

/** Wie lange ein Bild stehen bleibt, bevor es weitergeht (ms). */
const INTERVAL = 7000

/**
 * Großes Titelbild zum Durchwischen: mehrere Trend-Filme, wechselt von selbst.
 * Jeden Tag beginnt es mit einem anderen Film.
 */
export default function HeroCarousel({ items, films, onOpen }: Props) {
  const trackRef = useRef<HTMLDivElement>(null)
  const [index, setIndex] = useState(0)
  /** Zuletzt selbst gewischt – dann eine Weile nicht automatisch weiterblättern. */
  const touchedAt = useRef(0)
  const savedById = new Map(films.map((f) => [f.tmdbId, f]))
  const key = items.map((i) => i.id).join(",")

  // Start-Bild: jeden Tag ein anderes.
  useEffect(() => {
    const track = trackRef.current
    if (!track || items.length === 0) return
    const start = Math.floor(Date.now() / 864e5) % items.length
    track.scrollTo({ left: start * track.clientWidth, behavior: "instant" as ScrollBehavior })
    // items über key
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  // Automatisch weiter, solange sichtbar und nicht gerade selbst gewischt.
  useEffect(() => {
    if (items.length < 2) return
    const t = setInterval(() => {
      const track = trackRef.current
      if (!track || document.visibilityState !== "visible" || track.offsetParent === null) return
      if (Date.now() - touchedAt.current < 12_000) return
      const next = (Math.round(track.scrollLeft / track.clientWidth) + 1) % items.length
      track.scrollTo({ left: next * track.clientWidth, behavior: "smooth" })
    }, INTERVAL)
    return () => clearInterval(t)
  }, [items.length])

  function onScroll() {
    const track = trackRef.current
    if (track) setIndex(Math.round(track.scrollLeft / Math.max(track.clientWidth, 1)))
  }

  return (
    <div className="hero-carousel">
      <div
        className="hero-track"
        ref={trackRef}
        onScroll={onScroll}
        onPointerDown={() => { touchedAt.current = Date.now() }}
        onTouchStart={() => { touchedAt.current = Date.now() }}
      >
        {items.map((item) => (
          <button key={item.id} type="button" className="browse-hero" onClick={() => onOpen(item)}>
            <img src={backdropUrl(item.backdrop_path, "w780")!} alt="" loading="lazy" />
            <span className="browse-hero-text">
              <span className="browse-hero-kicker">Im Trend</span>
              <span className="browse-hero-title">{item.title}</span>
              {yearFromDate(item.release_date) !== null && <span className="browse-hero-meta">{yearFromDate(item.release_date)}</span>}
            </span>
            <StatusMarker film={savedById.get(item.id)} />
          </button>
        ))}
      </div>
      {items.length > 1 && (
        <div className="hero-dots" aria-hidden="true">
          {items.map((item, i) => <span key={item.id} className={i === index ? "on" : undefined} />)}
        </div>
      )}
    </div>
  )
}
