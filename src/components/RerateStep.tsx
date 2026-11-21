import type { Film } from "../types"
import { formatRating } from "../lib/format"
import { Poster } from "./FilmCard"
import StarRating from "./StarRating"
import { IconChevronRight } from "./Icons"

interface Props {
  film: Film
  /** Sterne aus den Notizen. */
  before: number
  /** Neue Sterne aus dem Fragebogen; null = „Weiß ich nicht mehr“ (jetzt in „Früher“). */
  after: number | null
  /** Wie viele Notiz-Filme noch übrig sind. */
  left: number
  onNext: () => void
  onDone: () => void
}

/** Zwischen zwei Filmen beim Nachbewerten: Vergleich Notiz → Fragebogen, dann weiter oder aufhören. */
export default function RerateStep({ film, before, after, left, onNext, onDone }: Props) {
  return (
    <div className="overlay rerate" role="dialog" aria-modal="true" aria-label="Nachbewerten">
      <div className="rerate-card">
        <div className="rerate-poster"><Poster path={film.posterPath} title={film.title} /></div>
        <h2 className="rerate-title">{film.title}</h2>
        <div className="rerate-compare">
          <div className="rerate-side">
            <span className="rerate-label">Notiz</span>
            <StarRating value={before} size={15} muted />
            <span className="rerate-num muted">{formatRating(before)}</span>
          </div>
          <IconChevronRight className="rerate-arrow" />
          <div className="rerate-side">
            <span className="rerate-label">Jetzt</span>
            {after === null ? (
              <span className="rerate-none">ohne Bewertung · in „Früher“</span>
            ) : (
              <>
                <StarRating value={after} size={15} />
                <span className="rerate-num">{formatRating(after)}</span>
              </>
            )}
          </div>
        </div>
        <p className="rerate-left">{left === 0 ? "Alle Filme aus den Notizen sind nachbewertet." : `Noch ${left} ${left === 1 ? "Film" : "Filme"} aus den Notizen`}</p>
        <div className="rerate-actions">
          {left > 0 && <button type="button" className="btn btn-primary btn-block" onClick={onNext}>Nächster Film</button>}
          <button type="button" className={`btn btn-block${left === 0 ? " btn-primary" : ""}`} onClick={onDone}>{left === 0 ? "Fertig" : "Fertig für heute"}</button>
        </div>
      </div>
    </div>
  )
}
