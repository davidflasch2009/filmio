import { useEffect, useMemo, useState } from "react"
import type { Film } from "../types"
import { formatRuntime } from "../lib/format"
import { Poster } from "./FilmCard"
import FilterChip from "./FilterChip"
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

/** Laufzeit-Grenze für den Filter „Unter 2 Std.“ (Minuten). */
const SHORT_LIMIT = 120

function filterPool(films: Film[], genre: string, short: boolean): Film[] {
  return films.filter((f) =>
    (!genre || f.genres.includes(genre)) &&
    (!short || (f.runtime !== null && f.runtime < SHORT_LIMIT)))
}

/** Zufälliger Vorschlag aus der Watchlist – auf Wunsch nur aus einem Genre oder nur kürzere Filme. */
export default function RandomPick({ films, onOpen, onClose }: Props) {
  const [reduced] = useState(prefersReducedMotion)
  const [genre, setGenre] = useState("")
  const [short, setShort] = useState(false)
  /** null = kein Film passt zum Filter. */
  const [spin, setSpin] = useState<Spin | null>(() => (films.length ? makeSpin(films, new Set(), null) : null))
  const [frame, setFrame] = useState(() => (reduced && spin ? spin.frames.length : 0))

  useEffect(() => {
    if (reduced || !spin) return
    const ids: number[] = []
    let t = 0
    spin.frames.forEach((_, i) => {
      t += STEPS[i]
      ids.push(window.setTimeout(() => setFrame(i + 1), t))
    })
    return () => ids.forEach(clearTimeout)
  }, [spin, reduced])

  const genres = useMemo(
    () => [...new Set(films.flatMap((f) => f.genres))].sort((a, b) => a.localeCompare(b, "de")),
    [films],
  )
  const pool = filterPool(films, genre, short)

  function start(next: Spin | null) {
    setSpin(next)
    setFrame(reduced && next ? next.frames.length : 0)
  }
  function again() {
    if (spin) start(makeSpin(pool, spin.seen, spin.target.tmdbId))
  }
  /** Filter ändern = neu würfeln, nur aus den passenden Filmen. */
  function applyFilter(nextGenre: string, nextShort: boolean) {
    setGenre(nextGenre)
    setShort(nextShort)
    const nextPool = filterPool(films, nextGenre, nextShort)
    start(nextPool.length ? makeSpin(nextPool, new Set(), null) : null)
  }

  const landed = spin !== null && frame >= spin.frames.length
  const shown = spin ? (landed ? spin.target : spin.frames[frame]) : null
  const meta = spin
    ? [spin.target.year, formatRuntime(spin.target.runtime), spin.target.genres.slice(0, 2).join(", ")].filter(Boolean).join(" · ")
    : ""

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
        <div className="pick-filters">
          <FilterChip
            id="pick-genre"
            label="Genre"
            options={[{ value: "", label: "Alle Genres" }, ...genres.map((g) => ({ value: g, label: g }))]}
            value={genre}
            onChange={(g) => applyFilter(g, short)}
            active={genre !== ""}
            idleLabel="Genre"
          />
          <button
            type="button"
            className={`chip chip-toggle${short ? " chip-active" : ""}`}
            aria-pressed={short}
            onClick={() => applyFilter(genre, !short)}
          >
            <span className="chip-text">Unter 2 Std.</span>
          </button>
        </div>

        {spin && shown ? (
          <>
            <div className={`pick-poster${landed ? " landed" : ""}`}>
              <Poster path={shown.posterPath} title={shown.title} />
            </div>
            <h2 className={`pick-title${landed ? "" : " rolling"}`} aria-live="polite">{shown.title}</h2>
            <p className="pick-meta">{landed ? meta : "\u00a0"}</p>
            <div className="pick-actions">
              <button type="button" className="btn btn-primary btn-block" disabled={!landed} onClick={() => onOpen(spin.target)}>
                Details ansehen
              </button>
              {pool.length > 1 && (
                <button type="button" className="btn btn-block" disabled={!landed} onClick={again}>
                  <IconDice />Anderer Vorschlag
                </button>
              )}
            </div>
          </>
        ) : (
          <p className="pick-empty" role="status">Kein Film auf deiner Watchlist passt zu diesem Filter.</p>
        )}
      </div>
    </div>
  )
}
