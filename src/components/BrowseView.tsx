import { useEffect, useMemo, useState } from "react"
import type { Film } from "../types"
import type { Region } from "../lib/settings"
import { GENRE_IDS } from "../lib/genres"
import { hasToken, loadList, type BrowseSource, type TmdbListItem } from "../lib/tmdb"
import { useOnline } from "../hooks/useOnline"
import type { MyCinema } from "../types"
import type { CpxMovie } from "../lib/cineplexx"
import { loadCinemaRow } from "../lib/cinemaRow"
import PosterRow from "./PosterRow"
import HeroCarousel from "./HeroCarousel"

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
  const liked = films.filter((f) => f.status === "watched" && !f.fromNotes && (f.rating ?? 0) >= 4)
  return liked.length ? liked[Math.floor(Math.random() * liked.length)] : null
}

/** Basis für „Für dich“: bis zu 5 deiner besten Filme (4,5+ Sterne; gibt es davon weniger als 3, ab 4 Sternen). */
function pickFavourites(films: Film[]): Film[] {
  const watched = films.filter((f) => f.status === "watched" && !f.fromNotes)
  let best = watched.filter((f) => (f.rating ?? 0) >= 4.5)
  if (best.length < 3) best = watched.filter((f) => (f.rating ?? 0) >= 4)
  return [...best].sort(() => Math.random() - 0.5).slice(0, 5)
}

/** So viele Filme muss „Für dich“ mindestens haben, sonst wird die Reihe ausgeblendet. */
const FOR_YOU_MIN = 6
/** Nur gut bewertete Filme (TMDB-Schnitt und Anzahl Stimmen) – TMDBs Empfehlungen enthalten viel Mittelmaß. */
const FOR_YOU_MIN_VOTE = 6.8
const FOR_YOU_MIN_VOTES = 1000

/**
 * „Für dich“: TMDB-Empfehlungen zu mehreren Lieblingsfilmen zusammengezählt – Filme, die von mehreren deiner
 * Lieblinge empfohlen werden, zuerst, danach die besser bewerteten. Ohne Gesehenes, Watchlist, noch nicht
 * Erschienenes und Mittelmaß.
 */
async function loadForYou(seeds: Film[], films: Film[]): Promise<TmdbListItem[]> {
  const known = new Set(films.map((f) => f.tmdbId))
  const today = new Date().toISOString().slice(0, 10)
  const lists = await Promise.all(seeds.map((f) => loadList({ kind: "recommendations", movieId: f.tmdbId }).catch(() => [])))
  const score = new Map<number, { item: TmdbListItem; hits: number; rank: number }>()
  for (const list of lists) {
    list.forEach((item) => {
      if (known.has(item.id) || !item.release_date || item.release_date > today) return
      if ((item.vote_average ?? 0) < FOR_YOU_MIN_VOTE || (item.vote_count ?? 0) < FOR_YOU_MIN_VOTES) return
      const e = score.get(item.id) ?? { item, hits: 0, rank: 0 }
      e.hits += 1
      e.rank = Math.max(e.rank, item.vote_average ?? 0)
      score.set(item.id, e)
    })
  }
  return [...score.values()].sort((a, b) => b.hits - a.hits || b.rank - a.rank).map((e) => e.item).slice(0, 20)
}

/** Deine häufigsten Genres (unter den gut bewerteten Filmen), sonst zwei Standard-Genres. */
function favouriteGenres(films: Film[]): string[] {
  const counts = new Map<string, number>()
  for (const f of films) {
    if (f.status !== "watched" || f.fromNotes || (f.rating ?? 0) < 3.5) continue
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
  const [favourites] = useState(() => pickFavourites(films))
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
  // „Für dich“ (einmal pro Sitzung; Gesehenes/Watchlist wird beim Anzeigen nochmal herausgefiltert).
  const [forYou, setForYou] = useState<TmdbListItem[] | null>(null)
  useEffect(() => {
    if (!started || !online || !hasToken || favourites.length === 0 || forYou) return
    let cancelled = false
    loadForYou(favourites, films).then((items) => { if (!cancelled) setForYou(items) }, () => {})
    return () => { cancelled = true }
    // films nur beim ersten Laden; danach filtert die Anzeige
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started, online, favourites, forYou])

  const cinemaItems = cinema && cinemaRow?.key === cinemaKey ? cinemaRow.items : cinema && programme ? undefined : []

  if (!hasToken) return null

  const savedById = new Map(films.map((f) => [f.tmdbId, f]))
  const trending = lists.trending
  // Titelbilder: Trend-Filme mit Szenenbild, die du noch nicht gesehen hast.
  const heroes = (trending ?? []).filter((t) => t.backdrop_path && savedById.get(t.id)?.status !== "watched").slice(0, 6)
  const loadedAnything = Object.keys(lists).length > 0
  // Offline und noch nichts geladen: nichts anzeigen (der Offline-Hinweis steht darüber).
  if (!online && !loadedAnything) return null

  return (
    <div className="browse">
      {heroes.length > 0 ? (
        <HeroCarousel items={heroes} films={films} onOpen={onOpenItem} />
      ) : trending === undefined && <div className="browse-hero browse-hero-skeleton" />}

      {(() => {
        if (favourites.length === 0) return null
        const items = forYou?.filter((i) => !savedById.has(i.id))
        if (items && items.length < FOR_YOU_MIN) return null
        return <PosterRow key="for-you" title="Für dich" items={items} films={films} onOpen={onOpenItem} />
      })()}

      {cinema && !(cinemaItems && cinemaItems.length === 0) && (
        <PosterRow key="my-cinema" title={`Jetzt im ${cinema.name}`} items={cinemaItems} films={films} onOpen={onOpenItem} />
      )}

      {rows.map((row) => {
        const items = lists[row.key]
        const shown = row.key === "trending" ? items?.filter((i) => !heroes.some((h) => h.id === i.id)) : items
        if (shown && shown.length === 0) return null
        return <PosterRow key={row.key} title={row.title} items={shown} films={films} onOpen={onOpenItem} />
      })}
    </div>
  )
}
