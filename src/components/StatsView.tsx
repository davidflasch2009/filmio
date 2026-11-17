import { useMemo, useRef, type ReactNode } from "react"
import type { Film } from "../types"
import { QUESTIONS } from "../lib/scoring"
import { formatRating } from "../lib/format"
import type { TmdbListItem } from "../lib/tmdb"
import { useSwipeBack } from "../hooks/useSwipeBack"
import PosterRow from "./PosterRow"
import { IconChevronLeft } from "./Icons"

interface Props {
  films: Film[]
  onClose: () => void
  onOpen: (film: Film) => void
}

interface BarRow {
  key: string
  label: ReactNode
  /** Länge des Balkens (relativ zum größten Wert der Liste). */
  value: number
  /** Zahl rechts neben dem Balken. */
  figure: string
  /** Kleine Zusatzangabe hinter der Zahl. */
  sub?: string
  /** Ausgeschrieben für Tooltip und Screenreader, z.B. „5 Sterne: 7 Filme“. */
  title: string
}

/**
 * Liste aus Name, Balken und Zahl je Zeile. Alle Balken wachsen von derselben Grundlinie,
 * jede Zeile nennt ihren Wert – die Liste ist damit zugleich die Tabellenansicht.
 */
function BarList({ rows, stacked = false }: { rows: BarRow[]; stacked?: boolean }) {
  const max = Math.max(1, ...rows.map((r) => r.value))
  return (
    <ul className={`bar-list${stacked ? " bar-list-stacked" : ""}`}>
      {rows.map((r) => (
        <li key={r.key} className="bar-row" title={r.title}>
          <span className="bar-label">{r.label}</span>
          <span className="bar-track" aria-hidden="true">
            {r.value > 0 && <span className="bar" style={{ width: `${Math.max(1.5, (r.value / max) * 100)}%` }} />}
          </span>
          <span className="bar-figure">
            {r.figure}
            {r.sub && <span className="bar-sub">{r.sub}</span>}
          </span>
        </li>
      ))}
    </ul>
  )
}

function StatTile({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div className="stat-tile">
      <span className="stat-value">{value}{unit && <span className="stat-unit">{unit}</span>}</span>
      <span className="stat-label">{label}</span>
    </div>
  )
}

const STAR_STEPS = [5, 4.5, 4, 3.5, 3, 2.5, 2, 1.5, 1, 0.5]
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`
/** Wie oft gesehen (gesehene Filme: 1 + weitere Male). */
const viewings = (f: Film) => (f.status === "watched" ? 1 + (f.rewatches?.length ?? 0) : 1)
/** Stunden – bei gesehenen Filmen jedes Mal mitgezählt. */
const hours = (films: Film[]) => Math.round(films.reduce((s, f) => s + (f.runtime ?? 0) * viewings(f), 0) / 60)

/** Statistik über die eigene Filmliste. */
export default function StatsView({ films, onClose, onOpen }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  useSwipeBack(ref, onClose)

  const stats = useMemo(() => {
    const watched = films.filter((f) => f.status === "watched")
    const rated = watched.filter((f) => f.rating !== null)
    const watchlist = films.filter((f) => f.status === "watchlist")
    const average = rated.length ? rated.reduce((s, f) => s + (f.rating ?? 0), 0) / rated.length : null

    const stars: BarRow[] = STAR_STEPS.map((step) => {
      const n = rated.filter((f) => f.rating === step).length
      return {
        key: String(step),
        label: <>{formatRating(step).replace(",0", "")}<span className="bar-star" aria-hidden="true">★</span></>,
        value: n,
        figure: String(n),
        title: `${formatRating(step)} Sterne: ${plural(n, "Film", "Filme")}`,
      }
    })

    const byGenre = new Map<string, { n: number; sum: number; ratedN: number }>()
    for (const f of watched) {
      for (const g of f.genres) {
        const e = byGenre.get(g) ?? { n: 0, sum: 0, ratedN: 0 }
        e.n++
        if (f.rating !== null) { e.sum += f.rating; e.ratedN++ }
        byGenre.set(g, e)
      }
    }
    const genres: BarRow[] = [...byGenre.entries()]
      .sort((a, b) => b[1].n - a[1].n || a[0].localeCompare(b[0], "de"))
      .slice(0, 8)
      .map(([g, e]) => {
        const avg = e.ratedN ? formatRating(e.sum / e.ratedN) : null
        return {
          key: g, label: g, value: e.n, figure: String(e.n), sub: avg ? `Ø ${avg}` : undefined,
          title: `${g}: ${plural(e.n, "Film", "Filme")}${avg ? `, im Schnitt ${avg} Sterne` : ""}`,
        }
      })

    const byDecade = new Map<number, number>()
    for (const f of watched) {
      if (f.year === null) continue
      const d = Math.floor(f.year / 10) * 10
      byDecade.set(d, (byDecade.get(d) ?? 0) + 1)
    }
    const decades: BarRow[] = [...byDecade.entries()]
      .sort((a, b) => b[0] - a[0])
      .map(([d, n]) => ({ key: String(d), label: `${d}er`, value: n, figure: String(n), title: `${d}er: ${plural(n, "Film", "Filme")}` }))

    // Welche Fragen beantwortest du am häufigsten mit Ja? (nur per Fragebogen bewertete Filme)
    const answered = watched.filter((f) => f.answers)
    const questions: BarRow[] = answered.length < 3 ? [] : QUESTIONS
      .map((q, i) => ({ q, share: answered.filter((f) => f.answers![i] === "ja").length / answered.length }))
      .sort((a, b) => b.share - a.share)
      .slice(0, 5)
      .map(({ q, share }) => ({
        key: q, label: q, value: share, figure: `${Math.round(share * 100)} %`,
        title: `${q} – Ja bei ${Math.round(share * 100)} % von ${answered.length} Filmen`,
      }))

    const best = [...rated]
      .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0) || a.title.localeCompare(b.title, "de"))
      .slice(0, 12)

    // Am öftesten gesehen (nur Filme, die du mehr als einmal gesehen hast).
    const repeated = watched.filter((f) => viewings(f) > 1)
    const mostWatched: BarRow[] = [...repeated]
      .sort((a, b) => viewings(b) - viewings(a) || a.title.localeCompare(b.title, "de"))
      .slice(0, 8)
      .map((f) => ({ key: String(f.tmdbId), label: f.title, value: viewings(f), figure: `${viewings(f)}×`, title: `${f.title}: ${viewings(f)}-mal gesehen` }))
    const totalViewings = watched.reduce((s, f) => s + viewings(f), 0)

    return { watched, rated, watchlist, average, mostWatched, totalViewings, stars, genres, decades, questions, answeredCount: answered.length, best }
  }, [films])

  const bestItems: TmdbListItem[] = stats.best.map((f) => ({ id: f.tmdbId, title: f.title, poster_path: f.posterPath }))

  return (
    <div className="overlay stats detail-enter" role="dialog" aria-modal="true" aria-label="Statistik" ref={ref}>
      <header className="stats-head">
        <button type="button" className="round-btn" onClick={onClose} aria-label="Zurück"><IconChevronLeft /></button>
        <h2 className="view-title">Statistik</h2>
      </header>

      {stats.watched.length === 0 ? (
        <p className="empty">Sobald du Filme als gesehen einträgst, erscheint hier deine Statistik.</p>
      ) : (
        <div className="stats-body">
          <div className="stat-row">
            <StatTile label="Filme gesehen" value={String(stats.watched.length)} />
            <StatTile label="Stunden geschaut" value={hours(stats.watched).toLocaleString("de-DE")} />
            <StatTile label="Bewertung im Schnitt" value={stats.average !== null ? formatRating(Math.round(stats.average * 10) / 10) : "–"} unit={stats.average !== null ? "★" : undefined} />
          </div>

          {stats.rated.length > 0 && (
            <section className="stats-card">
              <h3>Deine Bewertungen</h3>
              <BarList rows={stats.stars} />
            </section>
          )}

          {bestItems.length > 0 && (
            <PosterRow
              level={3}
              title="Deine besten Filme"
              items={bestItems}
              films={[]}
              onOpen={(item) => { const f = stats.best.find((b) => b.tmdbId === item.id); if (f) onOpen(f) }}
            />
          )}

          {stats.genres.length > 0 && (
            <section className="stats-card">
              <h3>Lieblingsgenres</h3>
              <BarList rows={stats.genres} />
            </section>
          )}

          {stats.decades.length > 1 && (
            <section className="stats-card">
              <h3>Nach Jahrzehnt</h3>
              <BarList rows={stats.decades} />
            </section>
          )}

          {stats.questions.length > 0 && (
            <section className="stats-card">
              <h3>Deine häufigsten Ja-Antworten</h3>
              <p className="hint stats-note">Aus {stats.answeredCount} per Fragebogen bewerteten Filmen</p>
              <BarList rows={stats.questions} stacked />
            </section>
          )}

          {stats.mostWatched.length > 0 && (
            <section className="stats-card">
              <h3>Am öftesten gesehen</h3>
              <p className="hint stats-note">{stats.totalViewings} Filmabende insgesamt</p>
              <BarList rows={stats.mostWatched} />
            </section>
          )}

          {stats.watchlist.length > 0 && (
            <div className="stat-row stat-row-2">
              <StatTile label="Auf der Watchlist" value={String(stats.watchlist.length)} />
              <StatTile label="Stunden auf der Watchlist" value={hours(stats.watchlist).toLocaleString("de-DE")} />
            </div>
          )}
        </div>
      )}
    </div>
  )
}
