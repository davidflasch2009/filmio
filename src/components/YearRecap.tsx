import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react"
import type { Film } from "../types"
import { buildRecap, MONTH_NAMES, topActor } from "../lib/recap"
import { formatRating } from "../lib/format"
import { backdropUrl, hasToken, loadMovieFull, posterUrl, smallImageUrl } from "../lib/tmdb"
import { useOnline } from "../hooks/useOnline"
import { Poster } from "./FilmCard"
import StarRating from "./StarRating"
import { IconX } from "./Icons"

interface Props {
  films: Film[]
  year: number
  onClose: () => void
  onOpen: (film: Film) => void
}

/** Wie lange eine Seite stehen bleibt, bevor es weitergeht (ms). */
const SLIDE_MS = 6500

type Cast = { id: number; name: string; profilePath: string | null }[]

interface Slide {
  key: string
  /** Hintergrund: Szenenbild oder Poster eines Films. */
  bg?: Film
  body: ReactNode
}

const filmWord = (n: number) => (n === 1 ? "Film" : "Filme")

function hoursText(minutes: number): { value: string; unit: string } {
  if (minutes < 120) return { value: String(minutes), unit: "Minuten" }
  const h = Math.round(minutes / 60)
  return { value: h.toLocaleString("de-DE"), unit: h === 1 ? "Stunde" : "Stunden" }
}

/** Jahresrückblick als Story: antippen = weiter (links = zurück), gedrückt halten = anhalten. */
export default function YearRecap({ films, year, onClose, onOpen }: Props) {
  const recap = useMemo(() => buildRecap(films, year), [films, year])
  const online = useOnline()
  const [idx, setIdx] = useState(0)
  const [paused, setPaused] = useState(false)
  /** Beginn des Drückens – langes Halten pausiert nur und blättert nicht weiter. */
  const pressStart = useRef(0)

  // Besetzung der Filme des Jahres (für „Lieblingsschauspieler“) – aus dem Cache oder von TMDB.
  const [cast, setCast] = useState<Map<number, Cast> | null>(null)
  const filmIds = recap?.films.map((f) => f.tmdbId).join(",") ?? ""
  useEffect(() => {
    if (!filmIds || !hasToken || !online) return
    let cancelled = false
    const ids = filmIds.split(",").map(Number)
    const out = new Map<number, Cast>()
    const queue = [...ids]
    const worker = async () => {
      while (queue.length && !cancelled) {
        const id = queue.shift()!
        try { out.set(id, (await loadMovieFull(id)).extras.cast) } catch { /* ohne diesen Film */ }
      }
    }
    void Promise.all([worker(), worker(), worker()]).then(() => { if (!cancelled) setCast(out) })
    return () => { cancelled = true }
  }, [filmIds, online])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
      if (e.key === "ArrowRight") setIdx((i) => i + 1)
      if (e.key === "ArrowLeft") setIdx((i) => Math.max(0, i - 1))
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  if (!recap) return null
  const actor = cast ? topActor(cast, recap.films) : null
  const time = hoursText(recap.minutes)
  const top = recap.best[0]
  const multi = recap.viewings.length !== recap.films.length

  const slides: Slide[] = [
    {
      key: "intro",
      body: (
        <div className="recap-center">
          <div className="recap-collage" aria-hidden="true">
            {recap.films.slice(0, 9).map((f) => <Poster key={f.tmdbId} path={f.posterPath} title={f.title} />)}
          </div>
          <p className="recap-kicker">Dein Filmjahr</p>
          <p className="recap-year">{year}</p>
        </div>
      ),
    },
    {
      key: "numbers",
      bg: recap.first.film,
      body: (
        <div className="recap-stack">
          <p className="recap-kicker">{year} hast du</p>
          <p className="recap-big">{recap.films.length} <span>{filmWord(recap.films.length)}</span></p>
          <p className="recap-kicker">geschaut – das sind</p>
          <p className="recap-big">{time.value} <span>{time.unit}</span></p>
          {multi && <p className="recap-line">an {recap.viewings.length} Filmabenden</p>}
          <p className="recap-line recap-muted">
            Los ging’s am {recap.first.date.toLocaleDateString("de-DE", { day: "numeric", month: "long" })} mit „{recap.first.film.title}“.
          </p>
        </div>
      ),
    },
  ]
  if (recap.topMonth && recap.topMonth.count > 1) {
    slides.push({
      key: "month",
      body: (
        <div className="recap-stack">
          <p className="recap-kicker">Dein stärkster Monat</p>
          <p className="recap-title">{MONTH_NAMES[recap.topMonth.month]}</p>
          <p className="recap-line">{recap.topMonth.count} Filmabende</p>
        </div>
      ),
    })
  }
  if (recap.genres.length > 0) {
    const [g, ...rest] = recap.genres
    slides.push({
      key: "genre",
      bg: recap.films.find((f) => f.genres.includes(g.name)),
      body: (
        <div className="recap-stack">
          <p className="recap-kicker">Am liebsten geschaut</p>
          <p className="recap-title">{g.name}</p>
          <p className="recap-line">{g.count} {filmWord(g.count)}</p>
          {rest.length > 0 && <p className="recap-line recap-muted">danach {rest.slice(0, 2).map((x) => x.name).join(" und ")}</p>}
        </div>
      ),
    })
  }
  if (top) {
    slides.push({
      key: "top",
      bg: top,
      body: (
        <div className="recap-center">
          <p className="recap-kicker">Dein Film des Jahres</p>
          <button type="button" className="recap-poster" onClick={(e) => { e.stopPropagation(); onOpen(top) }}>
            <Poster path={top.posterPath} title={top.title} variant="large" />
          </button>
          <p className="recap-film">{top.title}</p>
          <StarRating value={top.rating ?? 0} size={22} />
        </div>
      ),
    })
  }
  if (recap.best.length >= 3) {
    slides.push({
      key: "best",
      body: (
        <div className="recap-stack">
          <p className="recap-kicker">Deine Top {Math.min(5, recap.best.length)}</p>
          <ol className="recap-top">
            {recap.best.slice(0, 5).map((f, i) => (
              <li key={f.tmdbId}>
                <span className="recap-rank">{i + 1}</span>
                <Poster path={f.posterPath} title={f.title} />
                <span className="recap-top-text">
                  <span className="recap-top-title">{f.title}</span>
                  <span className="recap-muted">★ {formatRating(f.rating ?? 0)}</span>
                </span>
              </li>
            ))}
          </ol>
          {recap.average !== null && <p className="recap-line recap-muted">Im Schnitt hast du {formatRating(Math.round(recap.average * 10) / 10)} Sterne vergeben.</p>}
        </div>
      ),
    })
  }
  if (actor) {
    slides.push({
      key: "actor",
      body: (
        <div className="recap-center">
          <p className="recap-kicker">Am häufigsten gesehen</p>
          {actor.profilePath
            ? <img className="recap-portrait" src={smallImageUrl(actor.profilePath, "w185")!} alt="" />
            : <span className="recap-portrait recap-portrait-empty" aria-hidden="true">{actor.name.slice(0, 1)}</span>}
          <p className="recap-film">{actor.name}</p>
          <p className="recap-line">in {actor.films.length} Filmen</p>
          <p className="recap-line recap-muted">{actor.films.slice(0, 3).map((f) => f.title).join(" · ")}</p>
        </div>
      ),
    })
  }
  if (recap.repeated) {
    slides.push({
      key: "repeat",
      bg: recap.repeated.film,
      body: (
        <div className="recap-stack">
          <p className="recap-kicker">Konntest du nicht genug kriegen</p>
          <p className="recap-title">{recap.repeated.film.title}</p>
          <p className="recap-line">{recap.repeated.count}-mal gesehen</p>
        </div>
      ),
    })
  }
  slides.push({
    key: "summary",
    body: (
      <div className="recap-summary">
        <p className="recap-kicker">Dein Jahr {year}</p>
        <div className="recap-tiles">
          <div><strong>{recap.films.length}</strong><span>{filmWord(recap.films.length)}</span></div>
          <div><strong>{time.value}</strong><span>{time.unit}</span></div>
          {recap.average !== null && <div><strong>{formatRating(Math.round(recap.average * 10) / 10)}★</strong><span>im Schnitt</span></div>}
          {recap.genres[0] && <div><strong className="recap-tile-text">{recap.genres[0].name}</strong><span>Lieblingsgenre</span></div>}
        </div>
        {recap.best.length > 0 && (
          <div className="recap-strip" aria-label="Deine besten Filme">
            {recap.best.slice(0, 5).map((f) => <Poster key={f.tmdbId} path={f.posterPath} title={f.title} />)}
          </div>
        )}
        <div className="recap-actions">
          <button type="button" className="btn" onClick={(e) => { e.stopPropagation(); setIdx(0) }}>Nochmal ansehen</button>
          <button type="button" className="btn btn-primary" onClick={(e) => { e.stopPropagation(); onClose() }}>Fertig</button>
        </div>
      </div>
    ),
  })

  const current = Math.min(idx, slides.length - 1)
  const slide = slides[current]
  const last = current === slides.length - 1
  const bg = slide.bg
  const bgSrc = bg ? (bg.backdropPath ? backdropUrl(bg.backdropPath, "w780") : posterUrl(bg.posterPath, "w342")) : null

  function tap(e: ReactPointerEvent<HTMLDivElement>) {
    if ((e.target as HTMLElement).closest("button")) return
    if (e.timeStamp - pressStart.current > 400) return
    const rect = e.currentTarget.getBoundingClientRect()
    if (e.clientX - rect.left < rect.width * 0.3) setIdx(Math.max(0, current - 1))
    else if (!last) setIdx(current + 1)
  }

  return (
    <div className="recap" role="dialog" aria-modal="true" aria-label={`Jahresrückblick ${year}`}>
      {bgSrc && <img key={slide.key} className="recap-bg" src={bgSrc} alt="" />}
      <div className="recap-progress" aria-hidden="true">
        {slides.map((s, i) => (
          <span key={s.key} className="recap-seg">
            <span
              key={i === current ? `${s.key}-run` : s.key}
              className={`recap-fill${i < current ? " done" : i === current && !last ? " run" : i === current ? " done" : ""}`}
              style={i === current ? { animationDuration: `${SLIDE_MS}ms`, animationPlayState: paused ? "paused" : "running" } : undefined}
              onAnimationEnd={i === current ? () => setIdx((x) => Math.min(x + 1, slides.length - 1)) : undefined}
            />
          </span>
        ))}
      </div>
      <button type="button" className="round-btn recap-close" onClick={onClose} aria-label="Schließen"><IconX /></button>
      <div
        className="recap-stage"
        onPointerDown={(e) => { pressStart.current = e.timeStamp; setPaused(true) }}
        onPointerUp={(e) => { setPaused(false); tap(e) }}
        onPointerCancel={() => setPaused(false)}
        onPointerLeave={() => setPaused(false)}
      >
        <div key={slide.key} className="recap-slide" aria-live="polite">{slide.body}</div>
      </div>
      <p className="vh">Seite {current + 1} von {slides.length}</p>
    </div>
  )
}
