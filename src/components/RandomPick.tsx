import { useEffect, useState } from "react"
import type { Film } from "../types"
import { formatRuntime } from "../lib/format"
import { Poster } from "./FilmCard"
import { IconDice, IconX } from "./Icons"

interface Props {
  films: Film[]
  onOpen: (film: Film) => void
  onClose: () => void
}

/** Abstände zwischen den Mischbildern: erst schnell, dann langsamer – wie ein auslaufendes Glücksrad. */
const STEPS = [55, 60, 70, 80, 95, 115, 140, 175, 220, 280]

const prefersReducedMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false

interface Spin {
  target: Film
  /** Poster, die vor dem Ergebnis kurz aufblitzen. */
  frames: Film[]
  /** Bereits vorgeschlagene Filme – Wiederholungen erst, wenn alle einmal dran waren. */
  seen: Set<number>
}

function makeSpin(films: Film[], seen: Set<number>, lastId: number | null): Spin {
  let pool = films.filter((f) => !seen.has(f.tmdbId) && f.tmdbId !== lastId)
  let nextSeen = new Set(seen)
  if (pool.length === 0) {
    nextSeen = new Set()
    pool = films.filter((f) => f.tmdbId !== lastId)
  }
  if (pool.length === 0) pool = films
  const target = pool[Math.floor(Math.random() * pool.length)]
  nextSeen.add(target.tmdbId)
  const others = films.filter((f) => f.tmdbId !== target.tmdbId)
  const frames = others.length === 0 ? [] : STEPS.map(() => others[Math.floor(Math.random() * others.length)])
  return { target, frames, seen: nextSeen }
}

/** Zufälliger Vorschlag aus der Watchlist. */
export default function RandomPick({ films, onOpen, onClose }: Props) {
  const [reduced] = useState(prefersReducedMotion)
  const [spin, setSpin] = useState(() => makeSpin(films, new Set(), null))
  const [frame, setFrame] = useState(() => (reduced ? spin.frames.length : 0))

  useEffect(() => {
    if (reduced) return
    const ids: number[] = []
    let t = 0
    spin.frames.forEach((_, i) => {
      t += STEPS[i]
      ids.push(window.setTimeout(() => setFrame(i + 1), t))
    })
    return () => ids.forEach(clearTimeout)
  }, [spin, reduced])

  const landed = frame >= spin.frames.length
  const shown = landed ? spin.target : spin.frames[frame]
  const meta = [spin.target.year, formatRuntime(spin.target.runtime), spin.target.genres.slice(0, 2).join(", ")].filter(Boolean).join(" · ")

  function again() {
    const next = makeSpin(films, spin.seen, spin.target.tmdbId)
    setSpin(next)
    setFrame(reduced ? next.frames.length : 0)
  }

  return (
    <div
      className="overlay pick"
      role="dialog"
      aria-modal="true"
      aria-label="Zufälliger Film aus deiner Watchlist"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="pick-card">
        <button type="button" className="round-btn pick-close" onClick={onClose} aria-label="Schließen"><IconX /></button>
        <div className={`pick-poster${landed ? " landed" : ""}`}>
          <Poster path={shown.posterPath} title={shown.title} />
        </div>
        <h2 className={`pick-title${landed ? "" : " rolling"}`} aria-live="polite">{shown.title}</h2>
        <p className="pick-meta">{landed ? meta : " "}</p>
        <div className="pick-actions">
          <button type="button" className="btn btn-primary btn-block" disabled={!landed} onClick={() => onOpen(spin.target)}>
            Details ansehen
          </button>
          {films.length > 1 && (
            <button type="button" className="btn btn-block" disabled={!landed} onClick={again}>
              <IconDice />Anderer Vorschlag
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
