import { useState, type ReactNode } from "react"
import type { Answer, Film } from "../types"
import { QUESTIONS } from "../lib/scoring"
import { formatDate, formatRating, formatRuntime } from "../lib/format"
import { backdropUrl, posterUrl } from "../lib/tmdb"
import StarRating from "./StarRating"
import { IconBookmark, IconCheck, IconChevronLeft, IconMinus, IconPlus, IconTrash, IconX } from "./Icons"

interface Props {
  film: Film
  /** false = Vorschau eines Suchtreffers, der noch nicht gespeichert ist. */
  saved: boolean
  /** Ohne Einblend-Animation öffnen (z.B. direkt nach der Sterne-Enthüllung). */
  instant?: boolean
  onClose: () => void
  onRate: (film: Film) => void
  onAddToWatchlist: (film: Film) => void
  onMoveToWatchlist: (film: Film) => void
  onDelete: (film: Film) => void
  onSaveNote: (film: Film, note: string) => void
  onSetFromNotes: (film: Film, fromNotes: boolean) => void
}

const ANSWER_LABEL: Record<Answer, string> = { ja: "Ja", neutral: "Neutral", nein: "Nein" }
const ANSWER_ICON: Record<Answer, ReactNode> = { ja: <IconCheck />, neutral: <IconMinus />, nein: <IconX /> }

/**
 * Großes Szenenbild oben. Fallbacks: Szenenbild → unscharfes Poster → Verlauf.
 */
function Hero({ film }: { film: Film }) {
  const [failed, setFailed] = useState<string | null>(null)
  const backdrop = film.backdropPath && failed !== film.backdropPath ? film.backdropPath : null
  if (backdrop) {
    return (
      <img
        className="hero-img"
        src={backdropUrl(backdrop, "w780")!}
        srcSet={`${backdropUrl(backdrop, "w780")} 780w, ${backdropUrl(backdrop, "w1280")} 1280w`}
        sizes="(max-width: 960px) 100vw, 960px"
        alt=""
        onError={() => setFailed(backdrop)}
      />
    )
  }
  if (film.posterPath && failed !== film.posterPath) {
    return <img className="hero-img hero-blur" src={posterUrl(film.posterPath, "w185")!} alt="" onError={() => setFailed(film.posterPath)} />
  }
  return <div className="hero-img hero-empty" />
}

export default function FilmDetail({
  film, saved, instant = false, onClose, onRate, onAddToWatchlist, onMoveToWatchlist, onDelete, onSaveNote, onSetFromNotes,
}: Props) {
  const [note, setNote] = useState(film.note)
  const [noteFor, setNoteFor] = useState(film.note)
  const [noteSaved, setNoteSaved] = useState(false)
  // Wenn sich die gespeicherte Notiz ändert, Feld nachziehen.
  if (film.note !== noteFor) {
    setNoteFor(film.note)
    setNote(film.note)
  }

  const watched = saved && film.status === "watched"
  const meta = [film.year, formatRuntime(film.runtime)].filter(Boolean).join(" · ")
  const counts = film.answers?.reduce(
    (c, a) => ({ ...c, [a]: c[a] + 1 }), { ja: 0, neutral: 0, nein: 0 } as Record<Answer, number>)

  return (
    <div className={`overlay detail${instant ? "" : " detail-enter"}`} role="dialog" aria-modal="true" aria-label={film.title}>
      <div className="hero">
        <Hero film={film} />
        <button type="button" className="glass-btn back-btn" onClick={onClose} aria-label="Zurück"><IconChevronLeft /></button>
        <div className="hero-text">
          {saved && <span className="hero-status">{film.status === "watched" ? "Gesehen" : "Watchlist"}</span>}
          <h2 className="detail-title">{film.title}</h2>
          {meta && <p className="detail-meta">{meta}</p>}
        </div>
      </div>

      <div className="detail-body">
        {film.genres.length > 0 && <p className="detail-genres">{film.genres.join(" · ")}</p>}

        {watched && film.rating !== null && (
          <div className="detail-rating">
            <StarRating value={film.rating} size={24} />
            <span className="detail-rating-num">{formatRating(film.rating)}</span>
          </div>
        )}
        {watched && film.rating === null && <p className="detail-unrated">Noch nicht bewertet</p>}
        {watched && film.rating !== null && (
          <label className="check">
            <input type="checkbox" checked={film.fromNotes} onChange={(e) => onSetFromNotes(film, e.target.checked)} />
            <span>Aus meinen Notizen – nicht in der App bewertet</span>
          </label>
        )}

        <div className="detail-actions">
          {!saved && (
            <>
              <button type="button" className="btn btn-primary btn-block" onClick={() => onRate(film)}><IconCheck />Gesehen – jetzt bewerten</button>
              <button type="button" className="btn btn-block" onClick={() => onAddToWatchlist(film)}><IconPlus />Auf die Watchlist</button>
            </>
          )}
          {saved && film.status === "watchlist" && (
            <>
              <button type="button" className="btn btn-primary btn-block" onClick={() => onRate(film)}><IconCheck />Gesehen – jetzt bewerten</button>
              <button type="button" className="btn btn-danger btn-block" onClick={() => onDelete(film)}><IconTrash />Löschen</button>
            </>
          )}
          {watched && (
            <>
              <button type="button" className="btn btn-primary btn-block" onClick={() => onRate(film)}>
                {film.answers || film.rating !== null ? "Neu bewerten" : "Bewerten"}
              </button>
              <div className="btn-row">
                <button type="button" className="btn" onClick={() => onMoveToWatchlist(film)}><IconBookmark />Auf Watchlist</button>
                <button type="button" className="btn btn-danger" onClick={() => onDelete(film)}><IconTrash />Löschen</button>
              </div>
            </>
          )}
        </div>

        {saved && (
          <p className="detail-dates">
            Hinzugefügt am {formatDate(film.addedAt)}
            {watched && film.watchedAt && <> · Gesehen am {formatDate(film.watchedAt)}</>}
          </p>
        )}

        <section className="detail-section">
          <h3>Handlung</h3>
          <p className="overview">{film.overview || "Keine Beschreibung vorhanden."}</p>
        </section>

        {watched && (
          <section className="detail-section">
            <h3>Notiz</h3>
            <textarea
              className="note-field"
              aria-label="Notiz"
              value={note}
              rows={3}
              placeholder="Was willst du dir zu dem Film merken?"
              onChange={(e) => { setNote(e.target.value); setNoteSaved(false) }}
            />
            <div className="note-actions">
              <button
                type="button"
                className="btn btn-small"
                disabled={note.trim() === film.note}
                onClick={() => { onSaveNote(film, note.trim()); setNoteSaved(true) }}
              >
                Notiz speichern
              </button>
              {noteSaved && note.trim() === film.note && <span className="hint">Gespeichert ✓</span>}
            </div>
          </section>
        )}

        {watched && film.answers && counts && (
          <section className="detail-section">
            <h3>Antwortprofil</h3>
            <p className="hint">Ja {counts.ja} · Neutral {counts.neutral} · Nein {counts.nein}</p>
            <ol className="answer-profile">
              {QUESTIONS.map((q, i) => {
                const a = film.answers![i]
                return (
                  <li key={q} className={`profile-${a}`}>
                    <span className="profile-icon">{ANSWER_ICON[a]}</span>
                    <span className="profile-question">{q}</span>
                    <span className="profile-answer">{ANSWER_LABEL[a]}</span>
                  </li>
                )
              })}
            </ol>
          </section>
        )}
      </div>
    </div>
  )
}
