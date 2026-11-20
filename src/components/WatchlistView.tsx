import { useMemo, useState } from "react"
import type { Film, MyCinema, RegionCode, Service } from "../types"
import { matchMovie, type CpxMovie } from "../lib/cineplexx"
import { formatUpcomingShort, todayStamp, upcomingRelease, type Upcoming } from "../lib/release"
import { smallImageUrl } from "../lib/tmdb"
import { partAsFilm, waitingFor, type SeriesCache, type Waiting } from "../lib/series"
import FilmCard from "./FilmCard"
import FilterChip from "./FilterChip"
import ViewHeader from "./ViewHeader"
import { IconBookmark, IconDice, IconFlagFilled, IconTv } from "./Icons"

interface Props {
  films: Film[]
  region: RegionCode
  services: Service[]
  /** tmdbId → meine Dienste, bei denen der Film gerade läuft. */
  streams: Map<number, Service[]>
  /** Mein Kino + dessen Programm – für den Hinweis „Im Kino“. */
  cinema: MyCinema | null
  programme: CpxMovie[] | null
  /** Filmreihen – Filme, deren früherer Teil noch nicht gesehen ist, warten in „Später in der Reihe“. */
  series: SeriesCache
  onOpen: (film: Film) => void
  /** Fälligen Teil einer Reihe auf die Watchlist setzen. */
  onAddPart: (film: Film) => void
  onFindFilms: () => void
  onRandom: () => void
  onOpenServices: () => void
}

const PRIORITY_MARKER = { icon: <IconFlagFilled />, label: "Priorität" }
const WATCHLIST_MARKER = { icon: <IconBookmark />, label: "Auf der Watchlist" }

function serviceLogos(list: Service[] | undefined) {
  return (list ?? []).filter((s) => s.logoPath).map((s) => ({ src: smallImageUrl(s.logoPath, "w92")!, name: s.name }))
}

export default function WatchlistView({ films, region, services, streams, cinema, programme, series, onOpen, onAddPart, onFindFilms, onRandom, onOpenServices }: Props) {
  const [streamOnly, setStreamOnly] = useState(false)
  const [tag, setTag] = useState("")

  const { available, upcoming, later, total } = useMemo(() => {
    const today = todayStamp()
    const byId = new Map(films.map((f) => [f.tmdbId, f]))
    const all = films.filter((f) => f.status === "watchlist" && (!tag || (f.tags ?? []).includes(tag)))
    const available: Film[] = []
    const upcoming: { film: Film; when: Upcoming }[] = []
    const waiting: { film: Film; wait: Waiting }[] = []
    for (const f of all) {
      const when = upcomingRelease(f, region, today)
      const wait = when ? null : waitingFor(f, byId, series)
      if (when) upcoming.push({ film: f, when })
      else if (wait) waiting.push({ film: f, wait })
      else available.push(f)
    }
    // „Später in der Reihe“: nach Reihe gruppiert, je Reihe erst der fehlende Teil (Vorschlag), dann die wartenden.
    const groups = new Map<string, { film: Film; wait: Waiting }[]>()
    for (const w of waiting) groups.set(w.wait.name, [...(groups.get(w.wait.name) ?? []), w])
    const later: { film: Film; wait: Waiting | null }[] = []
    for (const name of [...groups.keys()].sort((a, b) => a.localeCompare(b, "de"))) {
      const list = groups.get(name)!.sort((a, b) => (a.film.year ?? 0) - (b.film.year ?? 0))
      const next = list[0].wait.next
      if (!byId.has(next.id)) later.push({ film: partAsFilm(next), wait: null })
      later.push(...list)
    }
    // Priorität zuerst, sonst neueste zuerst.
    available.sort((a, b) => Number(!!b.priority) - Number(!!a.priority) || (Date.parse(b.addedAt) || 0) - (Date.parse(a.addedAt) || 0))
    // Nächster Termin zuerst, offene Termine ans Ende.
    upcoming.sort((a, b) => (a.when.date ?? "9999").localeCompare(b.when.date ?? "9999") || a.film.title.localeCompare(b.film.title, "de"))
    return { available, upcoming, later, total: all.length }
  }, [films, region, tag, series])
  const tags = useMemo(
    () => [...new Set(films.filter((f) => f.status === "watchlist").flatMap((f) => f.tags ?? []))].sort((a, b) => a.localeCompare(b, "de")),
    [films],
  )
  if (tag && !tags.includes(tag)) setTag("")

  const inCinema = useMemo(() => {
    const ids = new Set<number>()
    if (!cinema || !programme) return ids
    for (const f of available) if (matchMovie(programme, f, cinema.id)) ids.add(f.tmdbId)
    return ids
  }, [available, cinema, programme])

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
                  marker={f.priority ? PRIORITY_MARKER : WATCHLIST_MARKER}
                  logos={serviceLogos(streams.get(f.tmdbId))}
                  badge={inCinema.has(f.tmdbId) ? "Im Kino" : undefined}
                  onOpen={() => onOpen(f)}
                />
              ))}
            </div>
          )}

          {!filterOn && later.length > 0 && (
            <section className="watchlist-upcoming" aria-labelledby="later-heading">
              <h2 id="later-heading" className="section-title">Später in der Reihe</h2>
              <div className="grid">
                {later.map(({ film: f, wait }) => wait ? (
                  <FilmCard
                    key={f.tmdbId}
                    title={f.title}
                    year={f.year}
                    posterPath={f.posterPath}
                    marker={f.priority ? PRIORITY_MARKER : WATCHLIST_MARKER}
                    badge={`Erst Teil ${wait.part}`}
                    look="waiting"
                    onOpen={() => onOpen(f)}
                  />
                ) : (
                  <FilmCard
                    key={f.tmdbId}
                    title={f.title}
                    year={f.year}
                    posterPath={f.posterPath}
                    badge="Fehlt noch · hinzufügen"
                    look="suggest"
                    actionLabel={`„${f.title}“ auf die Watchlist`}
                    onOpen={() => onAddPart(f)}
                  />
                ))}
              </div>
            </section>
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
                    marker={f.priority ? PRIORITY_MARKER : WATCHLIST_MARKER}
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
