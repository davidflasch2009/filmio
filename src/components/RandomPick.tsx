import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react"
import type { Film, Service } from "../types"
import { formatRuntime } from "../lib/format"
import { backdropUrl, loadFilmInfo } from "../lib/tmdb"
import { newFilm } from "../lib/storage"
import { candidates, type Candidate, type SeriesCache } from "../lib/series"
import { Poster } from "./FilmCard"
import FilterChip from "./FilterChip"
import { IconCheck, IconDice, IconPlus, IconTv, IconX } from "./Icons"

interface Props {
  /** Watchlist-Filme, die schon erschienen sind. */
  films: Film[]
  /** Alle gespeicherten Filme – um zu sehen, welche Teile einer Reihe schon gesehen sind. */
  allFilms: Film[]
  series: SeriesCache
  /** Filmreihen, die erst ab einem bestimmten Film zählen (Collection-ID → tmdbId). */
  seriesStart: Map<number, number>
  /** tmdbId → meine Dienste, bei denen der Film läuft (leer, wenn keine Dienste gewählt). */
  streams: Map<number, Service[]>
  hasServices: boolean
  onOpen: (film: Film, saved: boolean) => void
  onAddToWatchlist: (film: Film) => void
  onClose: () => void
}

/** Plätze im Karussell und Winkel zwischen zwei Postern. */
const SLOTS = 12
const STEP = 360 / SLOTS
/** Erster Wurf: 2 Runden in 2,5 s; „Anderer Vorschlag“: 1 Runde in 1,5 s. */
const FIRST = { turns: 2, ms: 2500 }
const AGAIN = { turns: 1, ms: 1500 }

const prefersReducedMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false
const randomOf = <T,>(list: T[]): T => list[Math.floor(Math.random() * list.length)]

/** Laufzeit-Grenze für den Filter „Unter 2 Std.“ (Minuten). */
const SHORT_LIMIT = 120

interface Filter { genre: string; short: boolean; mine: boolean }

function filterPool(pool: Candidate[], { genre, short, mine }: Filter, streams: Map<number, Service[]>): Candidate[] {
  return pool.filter(({ film: f }) =>
    (!genre || f.genres.includes(genre)) &&
    (!short || (f.runtime !== null && f.runtime < SHORT_LIMIT)) &&
    (!mine || (streams.get(f.tmdbId)?.length ?? 0) > 0))
}

/** Nächster Vorschlag: noch nicht dagewesene zuerst, nie zweimal hintereinander derselbe. */
function choose(pool: Candidate[], seen: Set<number>, lastId: number | null): { target: Candidate; seen: Set<number> } {
  let options = pool.filter((c) => !seen.has(c.film.tmdbId) && c.film.tmdbId !== lastId)
  let nextSeen = new Set(seen)
  if (options.length === 0) {
    nextSeen = new Set()
    options = pool.filter((c) => c.film.tmdbId !== lastId)
  }
  if (options.length === 0) options = pool
  const target = randomOf(options)
  nextSeen.add(target.film.tmdbId)
  return { target, seen: nextSeen }
}

interface Spin {
  target: Candidate
  seen: Set<number>
  /** Poster auf den Plätzen des Karussells. */
  slots: Film[]
  /** Platz, auf dem der Vorschlag liegt. */
  slot: number
  /** Drehung des Karussells (Grad) und Dauer der Bewegung dorthin (ms). */
  rotation: number
  ms: number
  landed: boolean
}

/** Karussell füllen: Poster der passenden Filme gemischt, so oft wie nötig wiederholt. */
function fillSlots(pool: Candidate[], keep: Map<number, Film>): Film[] {
  const films = pool.map((c) => c.film)
  const bag: Film[] = []
  return Array.from({ length: SLOTS }, (_, i) => {
    const kept = keep.get(i)
    if (kept) return kept
    if (bag.length === 0) bag.push(...[...films].sort(() => Math.random() - 0.5))
    return bag.pop()!
  })
}

/** Zufälliger Vorschlag aus der Watchlist – als Karussell, das ausläuft und den Film nach vorne holt. */
export default function RandomPick({ films, allFilms, series, seriesStart, streams, hasServices, onOpen, onAddToWatchlist, onClose }: Props) {
  const [reduced] = useState(prefersReducedMotion)
  const [filter, setFilter] = useState<Filter>({ genre: "", short: false, mine: false })
  const { genre, short, mine } = filter
  const all = useMemo(() => candidates(films, allFilms, series, seriesStart), [films, allFilms, series, seriesStart])
  const pool = filterPool(all, filter, streams)
  const [spin, setSpin] = useState<Spin | null>(null)
  const [adding, setAdding] = useState(false)
  /** Vorschläge, die gerade auf die Watchlist gesetzt wurden. */
  const [added, setAdded] = useState<Set<number>>(new Set())
  const timers = useRef<number[]>([])

  /** Würfeln: Karussell ohne sichtbaren Sprung neu belegen, dann auf den Vorschlag drehen. */
  function roll(from: Candidate[], prev: Spin | null, seen: Set<number>, speed: typeof FIRST) {
    timers.current.forEach(clearTimeout)
    timers.current = []
    if (from.length === 0) { setSpin(null); return }
    const { target, seen: nextSeen } = choose(from, seen, prev?.target.film.tmdbId ?? null)
    // Was gerade vorne und daneben zu sehen ist, bleibt stehen; der Vorschlag landet auf einem Platz hinten.
    const keep = new Map<number, Film>()
    if (prev) {
      for (const d of [-2, -1, 0, 1, 2]) keep.set((SLOTS + d) % SLOTS, prev.slots[(prev.slot + d + SLOTS) % SLOTS])
    }
    const slot = 4 + Math.floor(Math.random() * 5)
    const slots = fillSlots(from, keep)
    slots[slot] = target.film
    const end = -(speed.turns * 360 + slot * STEP)
    const still = reduced || from.length === 1
    setSpin({ target, seen: nextSeen, slots, slot, rotation: still ? end : 0, ms: 0, landed: still })
    if (still) return
    // Erst ohne Bewegung neu belegen, im nächsten Bild losdrehen.
    timers.current.push(window.setTimeout(() => {
      setSpin((s) => s && { ...s, rotation: end, ms: speed.ms })
      timers.current.push(window.setTimeout(() => setSpin((s) => s && { ...s, landed: true }), speed.ms))
    }, 30))
  }

  // Beim Öffnen gleich würfeln; beim Schließen laufende Zeitgeber stoppen.
  useEffect(() => {
    roll(pool, null, new Set(), FIRST)
    return () => { timers.current.forEach(clearTimeout) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const genres = useMemo(
    () => [...new Set(films.flatMap((f) => f.genres))].sort((a, b) => a.localeCompare(b, "de")),
    [films],
  )

  function again() {
    if (spin) roll(pool, spin, spin.seen, AGAIN)
  }
  /** Filter ändern = neu würfeln, nur aus den passenden Filmen. */
  function applyFilter(patch: Partial<Filter>) {
    const next = { ...filter, ...patch }
    setFilter(next)
    roll(filterPool(all, next, streams), spin, new Set(), AGAIN)
  }

  async function addTarget(c: Candidate) {
    if (adding) return
    setAdding(true)
    try {
      const info = await loadFilmInfo(c.film.tmdbId).catch(() => null)
      onAddToWatchlist(info ? newFilm(info) : c.film)
      setAdded((s) => new Set(s).add(c.film.tmdbId))
    } finally {
      setAdding(false)
    }
  }

  const target = spin?.target ?? null
  const landed = spin?.landed ?? false
  const meta = target
    ? [target.film.year, formatRuntime(target.film.runtime), target.film.genres.slice(0, 2).join(", ")].filter(Boolean).join(" · ")
    : ""
  const backdrop = target?.film.backdropPath ? backdropUrl(target.film.backdropPath, "w780") : null
  const isAdded = target ? added.has(target.film.tmdbId) : false

  return (
    <div className="overlay pick" role="dialog" aria-modal="true" aria-label="Zufälliger Film aus deiner Watchlist">
      {/* Szenenbild des Vorschlags, unscharf im Hintergrund */}
      <div className={`pick-bg${landed && backdrop ? " on" : ""}`} aria-hidden="true">
        {backdrop && <img key={backdrop} src={backdrop} alt="" />}
      </div>

      <button type="button" className="glass-btn pick-close" onClick={onClose} aria-label="Schließen"><IconX /></button>

      <div className="pick-inner">
        <div className="pick-filters">
          <FilterChip
            id="pick-genre"
            label="Genre"
            options={[{ value: "", label: "Alle Genres" }, ...genres.map((g) => ({ value: g, label: g }))]}
            value={genre}
            onChange={(g) => applyFilter({ genre: g })}
            active={genre !== ""}
            idleLabel="Genre"
          />
          <button type="button" className={`chip chip-toggle${short ? " chip-active" : ""}`} aria-pressed={short} onClick={() => applyFilter({ short: !short })}>
            <span className="chip-text">Unter 2 Std.</span>
          </button>
          {hasServices && (
            <button type="button" className={`chip chip-toggle${mine ? " chip-active" : ""}`} aria-pressed={mine} onClick={() => applyFilter({ mine: !mine })}>
              <IconTv /><span className="chip-text">Läuft bei mir</span>
            </button>
          )}
        </div>

        {spin && target ? (
          <>
            <div className={`pick-stage${landed ? " landed" : ""}`} aria-hidden="true">
              <div className="pick-ring" style={{ transform: `translateZ(calc(var(--r) * -1)) rotateY(${spin.rotation}deg)`, transitionDuration: `${spin.ms}ms` }}>
                {spin.slots.map((f, i) => (
                  <div key={i} className={`pick-item${i === spin.slot ? " front" : ""}`} style={{ "--a": `${i * STEP}deg` } as CSSProperties}>
                    <Poster path={f.posterPath} title={f.title} />
                  </div>
                ))}
              </div>
            </div>

            <div className={`pick-info${landed ? " on" : ""}`} aria-live="polite">
              {landed && (
                <>
                  {target.series && target.series.total > 1 && (
                    <p className="pick-series">Teil {target.series.part} von {target.series.total} · {target.series.name}</p>
                  )}
                  <h2 className="pick-title">{target.film.title}</h2>
                  {meta && <p className="pick-meta">{meta}</p>}
                  {!target.saved && !isAdded && (
                    <p className="pick-hint">Dieser Teil ist zuerst dran – er steht noch nicht auf deiner Watchlist.</p>
                  )}
                </>
              )}
            </div>

            <div className="pick-actions">
              <button type="button" className="btn btn-primary btn-block" disabled={!landed} onClick={() => onOpen(target.film, target.saved || isAdded)}>
                Details ansehen
              </button>
              {!target.saved && (
                <button type="button" className="btn btn-block" disabled={!landed || adding || isAdded} onClick={() => void addTarget(target)}>
                  {isAdded ? <><IconCheck />Auf der Watchlist</> : <><IconPlus />{adding ? "Wird hinzugefügt …" : "Auf die Watchlist"}</>}
                </button>
              )}
              {pool.length > 1 && (
                <button type="button" className="btn btn-block" disabled={!landed} onClick={again}>
                  <IconDice />Anderer Vorschlag
                </button>
              )}
            </div>
          </>
        ) : pool.length === 0 && (
          <p className="pick-empty" role="status">
            {films.length === 0 ? "Auf deiner Watchlist ist noch kein Film, der schon draußen ist." : "Kein Film auf deiner Watchlist passt zu diesem Filter."}
          </p>
        )}
      </div>
    </div>
  )
}
