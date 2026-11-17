import { useEffect, useRef, useState, type ReactNode } from "react"
import type { Answer, Film } from "../types"
import { QUESTION_HELP, QUESTIONS, scoreFromAnswers } from "../lib/scoring"
import { formatRating } from "../lib/format"
import { starFillPercent } from "../lib/stars"
import { backdropUrl, posterUrl } from "../lib/tmdb"
import StarRating from "./StarRating"
import { IconCheck, IconChevronLeft, IconInfo, IconMinus, IconX } from "./Icons"

export interface RatingResult {
  answers: Answer[]
  rating: number
}

interface Props {
  film: Pick<Film, "title" | "answers" | "posterPath" | "backdropPath">
  onCancel: () => void
  /** Wird nach der Sterne-Enthüllung aufgerufen. */
  onSave: (result: RatingResult) => void
  /** Als gesehen speichern, ohne zu bewerten (z.B. weil der Film zu lange her ist). */
  onSaveWithoutRating: () => void
  /** „i“ mit Erklärung zu jeder Frage zeigen (Mehr → Darstellung). */
  showHelp?: boolean
}

/** Wie eine Skala: Nein links, Ja rechts unter dem Daumen. */
const OPTIONS: { value: Answer; label: string; icon: ReactNode }[] = [
  { value: "nein", label: "Nein", icon: <IconX /> },
  { value: "neutral", label: "Neutral", icon: <IconMinus /> },
  { value: "ja", label: "Ja", icon: <IconCheck /> },
]
const LABEL: Record<Answer, string> = { ja: "Ja", neutral: "Neutral", nein: "Nein" }

/** Sperrzeit nach einer Antwort, damit ein Doppel-Tipp nicht die nächste Frage mitbeantwortet. */
const TAP_LOCK_MS = 300

const prefersReducedMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false

/** Unscharfes Szenenbild des Films als Hintergrund (Fallback: Poster, sonst schwarz). */
function CineBackground({ film }: { film: Pick<Film, "posterPath" | "backdropPath"> }) {
  const sources = [backdropUrl(film.backdropPath, "w780"), posterUrl(film.posterPath, "w185")].filter((s): s is string => !!s)
  const [stage, setStage] = useState(0)
  const src = sources[stage]
  return (
    <div className="cine" aria-hidden="true">
      {src && <img src={src} alt="" onError={() => setStage((s) => s + 1)} />}
    </div>
  )
}

/**
 * Enthüllung: nur fünf leere Sterne, die sich je nach Bewertung langsam füllen,
 * dann blendet die Zahl ein. Ein Tipp überspringt die Animation.
 */
function StarReveal({ rating, onDone }: { rating: number; onDone: () => void }) {
  const fillRef = useRef<HTMLSpanElement>(null)
  // Bei reduzierter Bewegung sofort vollständig zeigen.
  const [showNumber, setShowNumber] = useState(prefersReducedMotion)
  const timers = useRef<number[]>([])
  const finished = useRef(false)
  const onDoneRef = useRef(onDone)
  useEffect(() => { onDoneRef.current = onDone })

  const target = `${starFillPercent(rating)}%`

  useEffect(() => {
    const el = fillRef.current
    if (!el) return
    const local: number[] = []
    timers.current = local
    const later = (fn: () => void, ms: number) => { local.push(window.setTimeout(fn, ms)) }
    const finish = () => {
      if (finished.current) return
      finished.current = true
      onDoneRef.current()
    }
    if (prefersReducedMotion()) {
      el.style.width = target
      later(finish, 1400)
    } else {
      // kurze Pause mit leeren Sternen, dann füllen (Dauer wächst mit der Bewertung, am Ende langsamer)
      later(() => {
        const duration = 700 + rating * 340
        el.style.transition = `width ${duration}ms cubic-bezier(.4,.1,.3,1)`
        el.style.width = target
        later(() => {
          setShowNumber(true)
          later(finish, 1100)
        }, duration + 80)
      }, 550)
    }
    return () => { local.forEach(clearTimeout) }
  }, [rating, target])

  function skip() {
    if (finished.current) return
    timers.current.forEach(clearTimeout)
    const el = fillRef.current
    if (el) {
      el.style.transition = "none"
      el.style.width = target
    }
    setShowNumber(true)
    timers.current = [window.setTimeout(() => {
      if (finished.current) return
      finished.current = true
      onDoneRef.current()
    }, 500)]
  }

  return (
    <div className="reveal" onClick={skip} role="status" aria-label={`Deine Bewertung: ${formatRating(rating)} von 5 Sternen`}>
      <StarRating value={rating} size={46} fillRef={fillRef} startEmpty />
      <div className={`reveal-number${showNumber ? " show" : ""}`} aria-hidden="true">{formatRating(rating)}</div>
    </div>
  )
}

/** Fragebogen: eine Frage pro Screen, Auto-Weiter, danach die Sterne-Enthüllung. */
export default function RatingFlow({ film, onCancel, onSave, onSaveWithoutRating, showHelp = true }: Props) {
  const total = QUESTIONS.length
  const [step, setStep] = useState(0)
  const [answers, setAnswers] = useState<(Answer | undefined)[]>(() => Array(total).fill(undefined))
  const [result, setResult] = useState<RatingResult | null>(null)
  /** Erklärung zur Frage offen – bleibt für die nächsten Fragen offen, bis man sie zuklappt. */
  const [help, setHelp] = useState(false)
  const lockUntil = useRef(0)
  const headingRef = useRef<HTMLHeadingElement>(null)

  const previous = film.answers && film.answers.length === total ? film.answers : null

  useEffect(() => {
    headingRef.current?.focus()
  }, [step])

  function answer(value: Answer) {
    const now = Date.now()
    if (now < lockUntil.current || result) return
    lockUntil.current = now + TAP_LOCK_MS
    const next = [...answers]
    next[step] = value
    setAnswers(next)
    if (step === total - 1) {
      const complete = next as Answer[]
      setResult({ answers: complete, rating: scoreFromAnswers(complete) })
    } else {
      setStep(step + 1)
    }
  }

  function back() {
    lockUntil.current = 0
    setStep((s) => Math.max(0, s - 1))
  }

  function cancel() {
    const answered = answers.some((a) => a !== undefined)
    if (!answered || window.confirm("Bewertung abbrechen? Deine Antworten gehen verloren.")) onCancel()
  }

  return (
    <div className="overlay rating-flow" role="dialog" aria-modal="true" aria-label={`Bewertung: ${film.title}`}>
      <CineBackground film={film} />
      {result ? (
        <StarReveal rating={result.rating} onDone={() => onSave(result)} />
      ) : (
        <>
          <header className="rf-top">
            <button type="button" className="round-btn" onClick={cancel} aria-label="Bewertung abbrechen"><IconX /></button>
            <span className="rf-film">{film.title}</span>
            <span className="rf-count">{step + 1}/{total}</span>
          </header>
          <div className="rf-progress" aria-hidden="true">
            {QUESTIONS.map((q, i) => <i key={q} className={i < step ? "done" : i === step ? "current" : undefined} />)}
          </div>

          <section className="question">
            <p className="question-count" aria-live="polite">Frage {step + 1} von {total}</p>
            <h2 className="question-text" ref={headingRef} tabIndex={-1}>{QUESTIONS[step]}</h2>
            {showHelp && <button
              type="button"
              className={`question-info${help ? " open" : ""}`}
              aria-expanded={help}
              aria-controls="question-help"
              aria-label={help ? "Erklärung ausblenden" : "Frage erklären"}
              onClick={() => setHelp((h) => !h)}
            >
              <IconInfo />
            </button>}
            <p id="question-help" className="question-help" hidden={!showHelp || !help}>{QUESTION_HELP[step]}</p>
            <div className="answer-row">
              {OPTIONS.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  className={`answer answer-${o.value}${answers[step] === o.value ? " answer-selected" : ""}`}
                  aria-label={o.label}
                  title={o.label}
                  aria-pressed={answers[step] === o.value}
                  onClick={() => answer(o.value)}
                >
                  {o.icon}
                </button>
              ))}
            </div>
            {previous && <p className="hint question-previous">Letztes Mal: {LABEL[previous[step]]}</p>}
            <div className="question-nav">
              <button type="button" className="text-btn" onClick={back} disabled={step === 0}><IconChevronLeft />Zurück</button>
              {answers[step] !== undefined && step < total - 1 ? (
                <button type="button" className="text-btn" onClick={() => setStep(step + 1)}>Weiter</button>
              ) : step === 0 && (
                <button type="button" className="text-btn skip-rating" onClick={onSaveWithoutRating}>Früher gesehen – ohne Bewertung</button>
              )}
            </div>
          </section>
        </>
      )}
    </div>
  )
}
