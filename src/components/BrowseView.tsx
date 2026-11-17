import { useEffect, useMemo, useState } from "react"
import type { Film } from "../types"
import type { Region } from "../lib/settings"
import { GENRE_IDS } from "../lib/genres"
import { backdropUrl, hasToken, loadList, yearFromDate, type BrowseSource, type TmdbListItem } from "../lib/tmdb"
import { useOnline } from "../hooks/useOnline"
import type { MyCinema } from "../types"
import type { CpxMovie } from "../lib/cineplexx"
import { loadCinemaRow } from "../lib/cinemaRow"
import PosterRow, { StatusMarker } from "./PosterRow"

interface Props {
  films: Film[]
  region: Region
  /** Erst laden, wenn der Tab wirklich sichtbar ist. */
  active: boolean
  /** Mein Kino + dessen Programm – für die Reihe „Jetzt im …“. */
  cinema: MyCinema | null
  programme: CpxMovie[] | null
  onOpenItem: (item: TmdbListItem) => void
}

interface RowDef {
  key: string
  title: string
  source: BrowseSource
}

/** Ein Film, der dir gefallen hat – als Ausgangspunkt für Empfehlungen (pro Sitzung fest). */
function pickSeed(films: Film[]): Film | null {
  const liked = films.filter((f) => f.status === "watched" && (f.rating ?? 0) >= 4)
  return liked.length ? liked[Math.floor(Math.random() * liked.length)] : null
}

/** Deine häufigsten Genres (unter den gut bewerteten Filmen), sonst zwei Standard-Genres. */
function favouriteGenres(films: Film[]): string[] {
  const counts = new Map<string, number>()
  for (const f of films) {
    if (f.status !== "watched" || (f.rating ?? 0) < 3.5) continue
    for (const g of f.genres) if (g in GENRE_IDS) counts.set(g, (counts.get(g) ?? 0) + 1)
  }
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([g]) => g)
  for (const fallback of ["Action", "Komödie"]) if (top.length < 2 && !top.includes(fallback)) top.push(fallback)
  return top
}

/** Stöbern wie in einer Streaming-App: großes Titelbild und Poster-Reihen. */
export default function BrowseView({ films, region, active, cinema, programme, onOpenItem }: Props) {
  const online = useOnline()
  const [started, setStarted] = useState(active)
  if (active && !started) setStarted(true)

  const [seed] = useState(() => pickSeed(films))
  const [genres] = useState(() => favouriteGenres(films))

  const rows = useMemo<RowDef[]>(() => [
    { key: "trending", title: "Im Trend", source: { kind: "trending" } },
    ...(seed ? [{ key: `rec-${seed.tmdbId}`, title: `Weil dir „${seed.title}“ gefallen hat`, source: { kind: "recommendations", movieId: seed.tmdbId } as BrowseSource }] : []),
    // Mit eigenem Kino ersetzt dessen Reihe die allgemeinen Kinofilme.
    ...(cinema ? [] : [{ key: `now-${region}`, title: "Jetzt im Kino", source: { kind: "now_playing", region } as BrowseSource }]),
    { key: `genre-${genres[0]}`, title: genres[0], source: { kind: "genre", genreId: GENRE_IDS[genres[0]] } },
    { key: "popular", title: "Beliebt", source: { kind: "popular" } },
    { key: `genre-${genres[1]}`, title: genres[1], source: { kind: "genre", genreId: GENRE_IDS[genres[1]] } },
    { key: "top", title: "Bestbewertet", source: { kind: "top" } },
    { key: `upcoming-${region}`, title: "Demnächst im Kino", source: { kind: "upcoming", region } },
  ], [seed, genres, region, cinema])

  /** Geladene Listen je Reihe; fehlt der Eintrag, lädt die Reihe noch. Leere Liste = ausblenden. */
  const [lists, setLists] = useState<Record<string, TmdbListItem[]>>({})
  useEffect(() => {
    if (!started || !online || !hasToken) return
    let cancelled = false
    for (const row of rows) {
      loadList(row.source).then(
        (items) => { if (!cancelled) setLists((l) => (l[row.key] === items ? l : { ...l, [row.key]: items })) },
        () => { if (!cancelled) setLists((l) => (row.key in l ? l : { ...l, [row.key]: [] })) },
      )
    }
    return () => { cancelled = true }
  }, [started, online, rows])

  // Reihe „Jetzt im Cineplexx Villach“ (key: Kino, damit ein Kinowechsel neu lädt).
  const [cinemaRow, setCinemaRow] = useState<{ key: string; items: TmdbListItem[] } | null>(null)
  const cinemaKey = cinema && programme ? `${cinema.id}|${programme.length}` : null
  useEffect(() => {
    if (!started || !online || !hasToken || !cinema || !programme || !cinemaKey) return
    let cancelled = false
    loadCinemaRow(programme, cinema.id).then(
      (items) => { if (!cancelled) setCinemaRow({ key: cinemaKey, items }) },
      () => { if (!cancelled) setCinemaRow({ key: cinemaKey, items: [] }) },
    )
    return () => { cancelled = true }
    // cinemaKey fasst Kino und Programm zusammen
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started, online, cinemaKey])
  const cinemaItems = cinema && cinemaRow?.key === cinemaKey ? cinemaRow.items : cinema && programme ? undefined : []

  if (!hasToken) return null

  const savedById = new Map(films.map((f) => [f.tmdbId, f]))
  const trending = lists.trending
  const hero = trending?.find((t) => t.backdrop_path)
  const loadedAnything = Object.keys(lists).length > 0
  // Offline und noch nichts geladen: nichts anzeigen (der Offline-Hinweis steht darüber).
  if (!online && !loadedAnything) return null

  return (
    <div className="browse">
      {hero ? (
        <button type="button" className="browse-hero" onClick={() => onOpenItem(hero)}>
          <img src={backdropUrl(hero.backdrop_path, "w780")!} alt="" />
          <span className="browse-hero-text">
            <span className="browse-hero-kicker">Im Trend</span>
            <span className="browse-hero-title">{hero.title}</span>
            {yearFromDate(hero.release_date) !== null && <span className="browse-hero-meta">{yearFromDate(hero.release_date)}</span>}
          </span>
          <StatusMarker film={savedById.get(hero.id)} />
        </button>
      ) : trending === undefined && <div className="browse-hero browse-hero-skeleton" />}

      {cinema && !(cinemaItems && cinemaItems.length === 0) && (
        <PosterRow key="my-cinema" title={`Jetzt im ${cinema.name}`} items={cinemaItems} films={films} onOpen={onOpenItem} />
      )}

      {rows.map((row) => {
        const items = lists[row.key]
        const shown = row.key === "trending" && hero ? items?.filter((i) => i.id !== hero.id) : items
        if (shown && shown.length === 0) return null
        return <PosterRow key={row.key} title={row.title} items={shown} films={films} onOpen={onOpenItem} />
      })}
    </div>
  )
}
