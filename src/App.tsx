import { useEffect, useLayoutEffect, useRef, useState } from "react"
import type { Film, Store } from "./types"
import { addFilm, load, newFilm, removeFilm, STORAGE_KEY, updateFilm, type ImportResult } from "./lib/storage"
import { formatRating } from "./lib/format"
import { fetchBackdropPath, hasToken, listItemToInfo, type TmdbListItem } from "./lib/tmdb"
import { useOnline } from "./hooks/useOnline"
import { loadSettings, saveSettings, type Settings } from "./lib/settings"
import TabBar, { type Tab } from "./components/TabBar"
import SearchView from "./components/SearchView"
import WatchedView from "./components/WatchedView"
import WatchlistView from "./components/WatchlistView"
import EarlierView from "./components/EarlierView"
import MoreView from "./components/MoreView"
import FilmDetail from "./components/FilmDetail"
import RatingFlow, { type RatingResult } from "./components/RatingFlow"
import RandomPick from "./components/RandomPick"
import StatsView from "./components/StatsView"

/** Zeitstempel für neue Einträge (außerhalb der Komponente, damit klar ist: nur in Ereignissen benutzt). */
const nowIso = () => new Date().toISOString()
const nowMs = () => Date.now()

/** Eine geöffnete Detailseite. Von dort aus geöffnete Filme (Filmreihe, Empfehlungen) liegen als Stapel darüber. */
interface DetailEntry {
  tmdbId: number
  /** Vorschau eines noch nicht gespeicherten Films; null = gespeicherter Film. */
  draft: Film | null
  /** Ohne Einblend-Animation zeigen. */
  instant?: boolean
  /** Scroll-Position, zu der beim Zurückkehren gesprungen wird. */
  scroll?: number
}

interface Toast {
  id: number
  text: string
  undo?: () => void
}

export default function App() {
  const [store, setStore] = useState<Store>(load)
  const [tab, setTab] = useState<Tab>("watched")
  const [settings, setSettings] = useState(loadSettings)
  /** Stapel der geöffneten Detailseiten; die oberste wird angezeigt. */
  const [details, setDetails] = useState<DetailEntry[]>([])
  const detailRef = useRef<HTMLDivElement>(null)
  const [statsOpen, setStatsOpen] = useState(false)
  /** Film, der gerade bewertet wird. */
  const [rating, setRating] = useState<Film | null>(null)
  const [toast, setToast] = useState<Toast | null>(null)
  /** Zufallsvorschlag aus der Watchlist geöffnet. */
  const [picking, setPicking] = useState(false)
  const online = useOnline()
  const scrollPositions = useRef<Record<Tab, number>>({ watched: 0, watchlist: 0, earlier: 0, search: 0, more: 0 })

  // Änderungen aus anderen Browser-Tabs übernehmen.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY || e.key === null) setStore(load())
    }
    window.addEventListener("storage", onStorage)
    return () => window.removeEventListener("storage", onStorage)
  }, [])

  // Szenenbilder für Filme nachladen, die noch keins haben (z.B. aus einem Import oder älteren Versionen).
  const needsBackdrops = store.films.some((f) => f.backdropPath === undefined)
  useEffect(() => {
    if (!online || !hasToken || !needsBackdrops) return
    let cancelled = false
    const queue = load().films.filter((f) => f.backdropPath === undefined).map((f) => f.tmdbId)
    const worker = async () => {
      while (queue.length && !cancelled) {
        const id = queue.shift()!
        try {
          const backdropPath = await fetchBackdropPath(id)
          if (cancelled) return
          setStore(updateFilm(id, { backdropPath }))
        } catch {
          // Netzfehler o.ä.: beim nächsten Start erneut versuchen.
        }
      }
    }
    void Promise.all([worker(), worker(), worker()])
    return () => { cancelled = true }
  }, [online, needsBackdrops])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), toast.undo ? 6000 : 3500)
    return () => clearTimeout(t)
  }, [toast])

  const overlayOpen = details.length > 0 || rating !== null || picking || statsOpen
  useEffect(() => {
    document.body.classList.toggle("no-scroll", overlayOpen)
  }, [overlayOpen])

  // Scroll-Position je Tab merken.
  useLayoutEffect(() => {
    window.scrollTo(0, scrollPositions.current[tab])
  }, [tab])

  function changeTab(next: Tab) {
    if (next === tab) {
      window.scrollTo({ top: 0, behavior: "smooth" })
      return
    }
    scrollPositions.current[tab] = window.scrollY
    setTab(next)
  }

  function notify(text: string, undo?: () => void) {
    setToast({ id: Date.now(), text, undo })
  }

  /** Führt eine Speicher-Operation aus; Fehler (z.B. Speicher voll) werden angezeigt. */
  function persist(op: () => Store): boolean {
    try {
      setStore(op())
      return true
    } catch (e) {
      notify(e instanceof Error ? e.message : "Speichern fehlgeschlagen.")
      return false
    }
  }

  const findSaved = (tmdbId: number) => store.films.find((f) => f.tmdbId === tmdbId)

  function addToWatchlist(film: Film) {
    if (findSaved(film.tmdbId)) {
      notify(`„${film.title}“ ist schon in deiner Liste.`)
      return
    }
    const entry: Film = {
      ...film, status: "watchlist", rating: null, answers: null, watchedAt: null, fromNotes: false, addedAt: nowIso(),
    }
    if (persist(() => addFilm(entry))) notify(`„${film.title}“ zur Watchlist hinzugefügt.`)
  }

  function saveRating(film: Film, result: RatingResult) {
    const existing = findSaved(film.tmdbId)
    const now = nowIso()
    const updated: Film = {
      ...(existing ?? film),
      status: "watched",
      rating: result.rating,
      answers: result.answers,
      addedAt: existing?.addedAt ?? now,
      // Beim ersten Markieren als gesehen = heute. Neu-Bewerten ändert das Datum nicht
      // (auch nicht bei importierten Filmen ohne bekanntes Datum).
      watchedAt: existing?.status === "watched" ? existing.watchedAt : now,
      // Jetzt in der App per Fragebogen bewertet.
      fromNotes: false,
    }
    if (persist(() => addFilm(updated))) {
      setRating(null)
      // Nach der Enthüllung direkt auf der Detailseite des Films landen.
      showSaved(film.tmdbId)
      notify(`Gespeichert · ★ ${formatRating(result.rating)}`)
    }
  }

  /** Als gesehen speichern, ohne Bewertung (z.B. weil der Film zu lange her ist). */
  function saveWithoutRating(film: Film) {
    const existing = findSaved(film.tmdbId)
    const updated: Film = {
      ...(existing ?? film),
      status: "watched",
      rating: null,
      answers: null,
      fromNotes: false,
      addedAt: existing?.addedAt ?? nowIso(),
      // Wann genau, ist unbekannt – kein erfundenes Datum.
      watchedAt: existing?.status === "watched" ? existing.watchedAt : null,
    }
    if (persist(() => addFilm(updated))) {
      setRating(null)
      showSaved(film.tmdbId)
      notify("In „Früher gesehen“ gespeichert")
    }
  }

  function moveToWatchlist(film: Film) {
    if (film.rating !== null &&
      !window.confirm(`„${film.title}“ zurück auf die Watchlist schieben? Bewertung und Antworten werden entfernt.`)) return
    if (persist(() => updateFilm(film.tmdbId, { status: "watchlist", rating: null, answers: null, watchedAt: null, fromNotes: false }))) {
      notify(`„${film.title}“ ist wieder auf der Watchlist.`)
    }
  }

  function deleteFilm(film: Film) {
    if (!window.confirm(`„${film.title}“ wirklich löschen?`)) return
    const snapshot = findSaved(film.tmdbId)
    if (persist(() => removeFilm(film.tmdbId))) {
      closeDetail()
      notify(`„${film.title}“ gelöscht.`, snapshot
        ? () => { if (persist(() => addFilm(snapshot))) setToast(null) }
        : undefined)
    }
  }

  function saveNote(film: Film, note: string) {
    persist(() => updateFilm(film.tmdbId, { note }))
  }

  function setFromNotes(film: Film, fromNotes: boolean) {
    persist(() => updateFilm(film.tmdbId, { fromNotes }))
  }

  function changeSettings(patch: Partial<Settings>) {
    const next = { ...settings, ...patch }
    setSettings(next)
    saveSettings(next)
  }

  /** Mehrere Filme auf einmal auf die Watchlist (z.B. die fehlenden Teile einer Filmreihe). */
  function addManyToWatchlist(list: Film[]) {
    const fresh = list.filter((f) => !findSaved(f.tmdbId))
    if (fresh.length === 0) return
    const now = nowMs()
    const ok = fresh.every((f, i) => persist(() => addFilm({
      ...f, status: "watchlist", rating: null, answers: null, watchedAt: null, fromNotes: false, addedAt: new Date(now + i).toISOString(),
    })))
    if (ok) notify(fresh.length === 1 ? `„${fresh[0].title}“ zur Watchlist hinzugefügt.` : `${fresh.length} Filme zur Watchlist hinzugefügt.`)
  }

  function onImported(result: ImportResult) {
    setStore(result.store)
  }

  /** Detailseite eines gespeicherten Films aus einer Liste öffnen. */
  const openSaved = (film: Film) => setDetails([{ tmdbId: film.tmdbId, draft: null }])
  const closeDetail = () => setDetails((s) => s.slice(0, -1))

  /**
   * Film aus Suche, Stöber-Reihen, Filmreihe oder Empfehlungen öffnen – sofort, mit den Daten aus der Liste;
   * die Detailseite lädt den Rest nach. Ist schon eine Detailseite offen, kommt der Film darüber.
   */
  function openItem(item: TmdbListItem) {
    const entry: DetailEntry = { tmdbId: item.id, draft: findSaved(item.id) ? null : newFilm(listItemToInfo(item)) }
    const scroll = detailRef.current?.scrollTop ?? 0
    setDetails((s) => (s.length === 0 ? [entry] : [...s.slice(0, -1), { ...s[s.length - 1], scroll, instant: true }, entry]))
  }

  /** Nach dem Speichern die Detailseite des Films zeigen (falls sie nicht schon offen ist). */
  function showSaved(tmdbId: number) {
    setDetails((s) => (s.length > 0 && s[s.length - 1].tmdbId === tmdbId ? s : [...s, { tmdbId, draft: null, instant: true }]))
  }

  const detail = details[details.length - 1] ?? null
  const savedDetail = detail ? findSaved(detail.tmdbId) : undefined
  const detailFilm = savedDetail ?? detail?.draft ?? null

  return (
    <div className="app" data-grid={settings.gridSize}>
      <main className="main">
        <div hidden={tab !== "watched"}>
          <WatchedView films={store.films} onOpen={openSaved} onFindFilms={() => changeTab("search")} />
        </div>
        <div hidden={tab !== "watchlist"}>
          <WatchlistView
            films={store.films}
            onOpen={openSaved}
            onMarkWatched={setRating}
            onFindFilms={() => changeTab("search")}
            onRandom={() => setPicking(true)}
          />
        </div>
        <div hidden={tab !== "earlier"}>
          <EarlierView films={store.films} onOpen={openSaved} onFindFilms={() => changeTab("search")} />
        </div>
        <div hidden={tab !== "search"}>
          <SearchView
            films={store.films}
            region={settings.region}
            active={tab === "search"}
            onAddToWatchlist={addToWatchlist}
            onRate={setRating}
            onOpenItem={openItem}
            onError={notify}
          />
        </div>
        <div hidden={tab !== "more"}>
          <MoreView store={store} onImported={onImported} settings={settings} onSettingsChange={changeSettings} onOpenStats={() => setStatsOpen(true)} />
        </div>
      </main>

      <TabBar active={tab} onChange={changeTab} />

      {statsOpen && <StatsView films={store.films} onClose={() => setStatsOpen(false)} onOpen={openSaved} />}

      {detailFilm && (
        <FilmDetail
          key={`${details.length}-${detailFilm.tmdbId}`}
          film={detailFilm}
          saved={savedDetail !== undefined}
          instant={detail?.instant}
          initialScroll={detail?.scroll}
          scrollerRef={detailRef}
          region={settings.region}
          films={store.films}
          onClose={closeDetail}
          onOpenItem={openItem}
          onRate={setRating}
          onAddToWatchlist={addToWatchlist}
          onAddManyToWatchlist={addManyToWatchlist}
          onMoveToWatchlist={moveToWatchlist}
          onDelete={deleteFilm}
          onSaveNote={saveNote}
          onSetFromNotes={setFromNotes}
          onSaveWithoutRating={saveWithoutRating}
        />
      )}

      {rating && (
        <RatingFlow
          key={rating.tmdbId}
          film={findSaved(rating.tmdbId) ?? rating}
          onCancel={() => setRating(null)}
          onSave={(result) => saveRating(rating, result)}
          onSaveWithoutRating={() => saveWithoutRating(rating)}
        />
      )}

      {picking && (
        <RandomPick
          films={store.films.filter((f) => f.status === "watchlist")}
          onClose={() => setPicking(false)}
          onOpen={(film) => { setPicking(false); openSaved(film) }}
        />
      )}

      {toast && (
        <div className="toast" role="status" key={toast.id}>
          <span>{toast.text}</span>
          {toast.undo && <button type="button" className="text-btn" onClick={toast.undo}>Rückgängig</button>}
        </div>
      )}
    </div>
  )
}
