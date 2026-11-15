import { useState } from "react"
import type { Answer, Film } from "../types"
import { QUESTIONS } from "../lib/scoring"
import { formatDate, formatRating, formatRuntime } from "../lib/format"
import StarRating from "./StarRating"
import { Poster } from "./FilmCard"

interface Props {
  film: Film
  /** false = Vorschau eines Suchtreffers, der noch nicht gespeichert ist. */
  saved: boolean
  onClose: () => void
  onRate: (film: Film) => void
  onAddToWatchlist: (film: Film) => void
  onMoveToWatchlist: (film: Film) => void
  onDelete: (film: Film) => void
  onSaveNote: (film: Film, note: string) => void
  onSetFromNotes: (film: Film, fromNotes: boolean) => void
}

const ANSWER_LABEL: Record<Answer, { icon: string; text: string }> = {
  ja: { icon: "✓", text: "Ja" },
  neutral: { icon: "–", text: "Neutral" },
  nein: { icon: "✗", text: "Nein" },
}

export default function FilmDetail({
  film, saved, onClose, onRate, onAddToWatchlist, onMoveToWatchlist, onDelete, onSaveNote, onSetFromNotes,
}: Props) {
  const [note, setNote] = useState(film.note)
  const [noteFor, setNoteFor] = useState(film.note)
  const [noteSaved, setNoteSaved] = useState(false)
  // Wenn sich die gespeicherte Notiz ändert (z.B. nach Neu-Bewertung), Feld nachziehen.
  if (film.note !== noteFor) {
    setNoteFor(film.note)
    setNote(film.note)
  }

  const watched = saved && film.status === "watched"
  const runtime = formatRuntime(film.runtime)
  const counts = film.answers?.reduce(
    (c, a) => ({ ...c, [a]: c[a] + 1 }), { ja: 0, neutral: 0, nein: 0 } as Record<Answer, number>)

  const meta = [film.year, runtime].filter(Boolean).join(" · ")

  return (
    <div className="overlay detail" role="dialog" aria-modal="true" aria-label={film.title}>
      <header className="overlay-header">
        <button type="button" className="btn-link" onClick={onClose}>← Zurück</button>
        {saved && (
          <span className="overlay-status">{film.status === "watched" ? "Gesehen" : "Watchlist"}</span>
        )}
      </header>

      <div className="detail-body">
        <div className="detail-top">
          <Poster path={film.posterPath} title={film.title} variant="large" />
          <div className="detail-info">
            <h2 className="detail-title">{film.title}</h2>
            {meta && <p className="detail-meta">{meta}</p>}
            {film.genres.length > 0 && (
              <ul className="genres">
                {film.genres.map((g) => <li key={g}>{g}</li>)}
              </ul>
            )}
            {watched && film.rating !== null && (
              <div className="detail-rating">
                <StarRating value={film.rating} size="lg" />
                <span className="result-number">{formatRating(film.rating)} / 5</span>
              </div>
            )}
            {watched && film.rating !== null && (
              <label className="check">
                <input
                  type="checkbox"
                  checked={film.fromNotes}
                  onChange={(e) => onSetFromNotes(film, e.target.checked)}
                />
                <span>Aus meinen Notizen – nicht in der App bewertet</span>
              </label>
            )}
            {saved && (
              <p className="detail-dates">
                Hinzugefügt am {formatDate(film.addedAt)}
                {watched && film.watchedAt && <><br />Gesehen am {formatDate(film.watchedAt)}</>}
              </p>
            )}
          </div>
        </div>

        <div className="detail-actions">
          {!saved && (
            <>
              <button type="button" className="btn" onClick={() => onAddToWatchlist(film)}>＋ Watchlist</button>
              <button type="button" className="btn btn-primary" onClick={() => onRate(film)}>✓ Gesehen</button>
            </>
          )}
          {saved && film.status === "watchlist" && (
            <button type="button" className="btn btn-primary" onClick={() => onRate(film)}>
              ✓ Auf Gesehen schieben &amp; bewerten
            </button>
          )}
          {watched && (
            <>
              <button type="button" className="btn btn-primary" onClick={() => onRate(film)}>
                {film.answers || film.rating !== null ? "Neu bewerten" : "Bewerten"}
              </button>
              <button type="button" className="btn" onClick={() => onMoveToWatchlist(film)}>Zurück auf Watchlist</button>
            </>
          )}
          {saved && (
            <button type="button" className="btn btn-danger" onClick={() => onDelete(film)}>Löschen</button>
          )}
        </div>

        <section className="detail-section">
          <h3>Handlung</h3>
          <p className="overview">{film.overview || "Keine Beschreibung vorhanden."}</p>
        </section>

        {watched && (
          <section className="detail-section">
            <h3>Notiz</h3>
            <textarea
              aria-label="Notiz"
              value={note}
              rows={4}
              placeholder="Noch keine Notiz."
              onChange={(e) => { setNote(e.target.value); setNoteSaved(false) }}
            />
            <div className="note-actions">
              <button
                type="button"
                className="btn"
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
                    <span className="profile-icon" aria-hidden="true">{ANSWER_LABEL[a].icon}</span>
                    <span className="profile-question">{q}</span>
                    <span className="profile-answer">{ANSWER_LABEL[a].text}</span>
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
