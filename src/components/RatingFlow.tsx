import { useEffect, useRef, useState } from "react"
import type { Answer, Film } from "../types"
import { QUESTIONS, scoreFromAnswers } from "../lib/scoring"
import { formatRating } from "../lib/format"
import StarRating from "./StarRating"
import { Poster } from "./FilmCard"

export interface RatingResult {
  answers: Answer[]
  rating: number
  note: string
}

interface Props {
  film: Pick<Film, "title" | "year" | "posterPath" | "answers" | "note">
  onCancel: () => void
  onSave: (result: RatingResult) => void
}

const OPTIONS: { value: Answer; label: string }[] = [
  { value: "ja", label: "Ja" },
  { value: "neutral", label: "Neutral" },
  { value: "nein", label: "Nein" },
]

const LABEL: Record<Answer, string> = { ja: "Ja", neutral: "Neutral", nein: "Nein" }

/** Sperrzeit nach einer Antwort, damit ein Doppel-Tipp nicht die nächste Frage mitbeantwortet. */
const TAP_LOCK_MS = 300

/** Fragebogen: eine Frage pro Screen, Auto-Weiter, am Ende Sterne + Notiz + Speichern. */
export default function RatingFlow({ film, onCancel, onSave }: Props) {
  const total = QUESTIONS.length
  const [step, setStep] = useState(0) // 0..total-1 = Fragen, total = Ergebnis
  const [answers, setAnswers] = useState<(Answer | undefined)[]>(() => Array(total).fill(undefined))
  const [note, setNote] = useState(film.note ?? "")
  const lockUntil = useRef(0)
  const headingRef = useRef<HTMLHeadingElement>(null)

  const previous = film.answers && film.answers.length === total ? film.answers : null
  const done = step >= total
  const complete = answers.every((a): a is Answer => a !== undefined)
  const rating = complete ? scoreFromAnswers(answers as Answer[]) : null

  useEffect(() => {
    headingRef.current?.focus()
  }, [step])

  function answer(value: Answer) {
    const now = Date.now()
    if (now < lockUntil.current) return
    lockUntil.current = now + TAP_LOCK_MS
    setAnswers((prev) => {
      const next = [...prev]
      next[step] = value
      return next
    })
    setStep((s) => Math.min(total, s + 1))
  }

  function back() {
    lockUntil.current = 0
    setStep((s) => Math.max(0, s - 1))
  }

  function cancel() {
    const answered = answers.some((a) => a !== undefined)
    if (!answered || window.confirm("Bewertung abbrechen? Deine Antworten gehen verloren.")) onCancel()
  }

  function save() {
    if (!complete || rating === null) return
    onSave({ answers: answers as Answer[], rating, note: note.trim() })
  }

  return (
    <div className="overlay rating-flow" role="dialog" aria-modal="true" aria-label={`Bewertung: ${film.title}`}>
      <header className="overlay-header">
        <button type="button" className="btn-link" onClick={cancel}>✕ Abbrechen</button>
        <span className="overlay-title">{film.title}{film.year ? ` (${film.year})` : ""}</span>
      </header>

      <div className="progress" aria-hidden="true">
        <div className="progress-bar" style={{ width: `${(Math.min(step, total) / total) * 100}%` }} />
      </div>

      {!done ? (
        <section className="question">
          <p className="question-count" aria-live="polite">Frage {step + 1}/{total}</p>
          <h2 className="question-text" ref={headingRef} tabIndex={-1}>{QUESTIONS[step]}</h2>
          <div className="answer-buttons">
            {OPTIONS.map((o) => (
              <button
                key={o.value}
                type="button"
                className={`answer answer-${o.value}${answers[step] === o.value ? " answer-selected" : ""}`}
                aria-pressed={answers[step] === o.value}
                onClick={() => answer(o.value)}
              >
                {o.label}
              </button>
            ))}
          </div>
          {previous && <p className="hint">Letztes Mal: {LABEL[previous[step]]}</p>}
          <div className="question-nav">
            <button type="button" className="btn" onClick={back} disabled={step === 0}>← Zurück</button>
            {answers[step] !== undefined && (
              <button type="button" className="btn" onClick={() => setStep((s) => s + 1)}>Weiter →</button>
            )}
          </div>
        </section>
      ) : (
        <section className="result">
          <Poster path={film.posterPath} title={film.title} variant="large" />
          <h2 className="result-heading" ref={headingRef} tabIndex={-1}>Deine Bewertung</h2>
          {rating !== null && (
            <div className="result-score">
              <StarRating value={rating} size="lg" />
              <span className="result-number">{formatRating(rating)} / 5</span>
            </div>
          )}
          <label className="field">
            <span>Notiz (optional)</span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={4}
              placeholder="Was willst du dir zu dem Film merken?"
            />
          </label>
          <div className="result-actions">
            <button type="button" className="btn" onClick={back}>← Antworten ändern</button>
            <button type="button" className="btn btn-primary" onClick={save} disabled={!complete}>Speichern</button>
          </div>
        </section>
      )}
    </div>
  )
}
