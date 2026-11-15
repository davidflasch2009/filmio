import { useState, type ReactNode } from "react"
import { posterUrl } from "../lib/tmdb"
import StarRating from "./StarRating"

interface PosterProps {
  path: string | null
  title: string
  variant?: "thumb" | "large"
}

/**
 * Poster mit Fallbacks: Ist das große Bild nicht ladbar (z.B. offline und nicht im Cache),
 * wird das kleine Listen-Poster versucht, danach ein Platzhalter.
 */
export function Poster({ path, title, variant = "thumb" }: PosterProps) {
  const [stage, setStage] = useState(variant === "large" ? 0 : 1)
  const [prevPath, setPrevPath] = useState(path)
  if (path !== prevPath) {
    setPrevPath(path)
    setStage(variant === "large" ? 0 : 1)
  }

  if (!path || stage > 1) {
    return (
      <div className={`poster poster-${variant} poster-empty`} aria-label={`Kein Poster für ${title}`} role="img">
        <span>{title.slice(0, 1).toUpperCase() || "?"}</span>
      </div>
    )
  }

  const src = stage === 0 ? posterUrl(path, "w342")! : posterUrl(path, "w185")!
  const srcSet = stage === 0
    ? `${posterUrl(path, "w342")} 1x, ${posterUrl(path, "w500")} 2x`
    : `${posterUrl(path, "w185")} 1x, ${posterUrl(path, "w342")} 2x`

  return (
    <img
      key={stage}
      className={`poster poster-${variant}`}
      src={src}
      srcSet={srcSet}
      alt={`Poster: ${title}`}
      loading={variant === "thumb" ? "lazy" : "eager"}
      decoding="async"
      onError={() => setStage((s) => s + 1)}
    />
  )
}

interface Props {
  title: string
  year: number | null
  posterPath: string | null
  rating?: number | null
  badge?: ReactNode
  onOpen?: () => void
  children?: ReactNode
}

/** Karte für Listen und Suchtreffer: Poster, Titel, Sterne + Jahr, optional Hinweis und Buttons. */
export default function FilmCard({ title, year, posterPath, rating, badge, onOpen, children }: Props) {
  const body = (
    <>
      <Poster path={posterPath} title={title} />
      <span className="card-text">
        <span className="card-title">{title}</span>
        {(rating != null || year !== null) && (
          <span className="card-meta">
            {rating != null && <StarRating value={rating} size={11} />}
            {year !== null && <span className="card-year">{year}</span>}
          </span>
        )}
        {badge && <span className="card-badge">{badge}</span>}
      </span>
    </>
  )

  return (
    <article className="card">
      {onOpen ? (
        <button type="button" className="card-main" onClick={onOpen} title="Details öffnen">{body}</button>
      ) : (
        <div className="card-main">{body}</div>
      )}
      {children && <div className="card-actions">{children}</div>}
    </article>
  )
}
