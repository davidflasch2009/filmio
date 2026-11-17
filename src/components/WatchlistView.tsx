import { useMemo, useState } from "react"
import type { Film, RegionCode, Service } from "../types"
import { formatUpcomingShort, todayStamp, upcomingRelease, type Upcoming } from "../lib/release"
import { smallImageUrl } from "../lib/tmdb"
import FilmCard from "./FilmCard"
import FilterChip from "./FilterChip"
import ViewHeader from "./ViewHeader"
import { IconCheck, IconDice, IconFlagFilled, IconTv } from "./Icons"

interface Props {
  films: Film[]
  region: RegionCode
  services: Service[]
  /** tmdbId → meine Dienste, bei denen der Film gerade läuft. */
  streams: Map<number, Service[]>
  onOpen: (film: Film) => void
  onMarkWatched: (film: Film) => void
  onFindFilms: () => void
  onRandom: () => void
  onOpenServices: () => void
}

const PRIORITY_MARKER = { icon: <IconFlagFilled />, label: "Priorität" }

function serviceLogos(list: Service[] | undefined) {
  return (list ?? []).filter((s) => s.logoPath).map((s) => ({ src: smallImageUrl(s.logoPath, "w92")!, name: s.name }))
}

export default function WatchlistView({ films, region, services, streams, onOpen, onMarkWatched, onFindFilms, onRandom, onOpenServices }: Props) {
  const [streamOnly, setStreamOnly] = useState(false)
  const [tag, setTag] = useState("")

  const { available, upcoming, total } = useMemo(() => {
    const today = todayStamp()
    const all = films.filter((f) => f.status === "watchlist" && (!tag || (f.tags ?? []).includes(tag)))
    const available: Film[] = []
    const upcoming: { film: Film; when: Upcoming }[] = []
    for (const f of all) {
      const when = upcomingRelease(f, region, today)
      if (when) upcoming.push({ film: f, when })
      else available.push(f)
    }
    // Priorität zuerst, sonst neueste zuerst.
    available.sort((a, b) => Number(!!b.priority) - Number(!!a.priority) || (Date.parse(b.addedAt) || 0) - (Date.parse(a.addedAt) || 0))
    // Nächster Termin zuerst, offene Termine ans Ende.
    upcoming.sort((a, b) => (a.when.date ?? "9999").localeCompare(b.when.date ?? "9999") || a.film.title.localeCompare(b.film.title, "de"))
    return { available, upcoming, total: all.length }
  }, [films, region, tag])
  const tags = useMemo(
    () => [...new Set(films.filter((f) => f.status === "watchlist").flatMap((f) => f.tags ?? []))].sort((a, b) => a.localeCompare(b, "de")),
    [films],
  )
  if (tag && !tags.includes(tag)) setTag("")

  const filterOn = streamOnly && services.length > 0
  const shown = filterOn ? available.filter((f) => (streams.get(f.tmdbId)?.length ?? 0) > 0) : available
  const today = todayStamp()

  function toggleStreamOnly() {
    if (services.length === 0) onOpenServices()
    else setStreamOnly((v) => !v)
  }

  return (
    <section className="view" aria-labelledby="watchlist-heading">
      <ViewHeader
        id="watchlist-heading"
        title="Watchlist"
        action={available.length > 0 && (
          <button type="button" className="round-btn accent-btn" onClick={onRandom} aria-label="Zufälligen Film vorschlagen" title="Zufälliger Film">
            <IconDice />
          </button>
        )}
      >
        {(available.length > 0 || tag !== "") && (
          <div className="chips">
            {tags.length > 0 && (
              <FilterChip
                id="watchlist-tag"
                label="Liste"
                options={[{ value: "", label: "Alle Listen" }, ...tags.map((t) => ({ value: t, label: t }))]}
                value={tag}
                onChange={setTag}
                active={tag !== ""}
                idleLabel="Liste"
              />
            )}
            <button
              type="button"
              className={`chip chip-toggle${filterOn ? " chip-active" : ""}`}
              aria-pressed={filterOn}
              onClick={toggleStreamOnly}
            >
              <IconTv /><span className="chip-text">Läuft bei mir</span>
            </button>
          </div>
        )}
      </ViewHeader>

      {total === 0 ? (
        <div className="empty">
          <p>Deine Watchlist ist leer.</p>
          <button type="button" className="btn btn-primary" onClick={onFindFilms}>Film suchen</button>
        </div>
      ) : (
        <>
          {filterOn && shown.length === 0 && (
            <div className="empty empty-small">
              <p>Gerade läuft nichts davon bei deinen Diensten.</p>
              <button type="button" className="text-btn" onClick={onOpenServices}>Meine Dienste</button>
            </div>
          )}
          {shown.length > 0 && (
            <div className="grid">
              {shown.map((f) => (
                <FilmCard
                  key={f.tmdbId}
                  title={f.title}
                  year={f.year}
                  posterPath={f.posterPath}
                  marker={f.priority ? PRIORITY_MARKER : undefined}
                  logos={serviceLogos(streams.get(f.tmdbId))}
                  onOpen={() => onOpen(f)}
                >
                  <button type="button" className="pill pill-accent" onClick={() => onMarkWatched(f)} aria-label={`${f.title} als gesehen markieren`}>
                    <IconCheck />Gesehen
                  </button>
                </FilmCard>
              ))}
            </div>
          )}

          {!filterOn && upcoming.length > 0 && (
            <section className="watchlist-upcoming" aria-labelledby="upcoming-heading">
              <h2 id="upcoming-heading" className="section-title">Kommt bald</h2>
              <div className="grid">
                {upcoming.map(({ film: f, when }) => (
                  <FilmCard
                    key={f.tmdbId}
                    title={f.title}
                    year={f.year}
                    posterPath={f.posterPath}
                    marker={f.priority ? PRIORITY_MARKER : undefined}
                    badge={formatUpcomingShort(when, today)}
                    onOpen={() => onOpen(f)}
                  />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </section>
  )
}
