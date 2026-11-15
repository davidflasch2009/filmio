import { useEffect, useLayoutEffect, useRef, useState } from "react"
import type { Film, Store } from "./types"
import { addFilm, load, removeFilm, STORAGE_KEY, updateFilm, type ImportResult } from "./lib/storage"
import { formatRating } from "./lib/format"
import { fetchBackdropPath, hasToken } from "./lib/tmdb"
import { useOnline } from "./hooks/useOnline"
import { loadSettings, saveSettings, type GridSize } from "./lib/settings"
import TabBar, { type Tab } from "./components/TabBar"
import SearchView from "./components/SearchView"
import WatchedView from "./components/WatchedView"
import WatchlistView from "./components/WatchlistView"
import MoreView from "./components/MoreView"
import FilmDetail from "./components/FilmDetail"
import RatingFlow, { type RatingResult } from "./components/RatingFlow"
import RandomPick from "./components/RandomPick"

interface Toast {
  id: number
  text: string
  undo?: () => void
}

export default function App() {
  const [store, setStore] = useState<Store>(load)
  const [tab, setTab] = useState<Tab>("watched")
  const [settings, setSettings] = useState(loadSettings)
  /** Geöffnete Detailansicht: gespeicherter Film (per tmdbId) oder Vorschau eines Suchtreffers (draft). */
  const [detail, setDetail] = useState<{ tmdbId: number; draft: Film | null; instant?: boolean } | null>(null)
  /** Film, der gerade bewertet wird. */
  const [rating, setRating] = useState<Film | null>(null)
  const [toast, setToast] = useState<Toast | null>(null)
  /** Zufallsvorschlag aus der Watchlist geöffnet. */
  const [picking, setPicking] = useState(false)
  const online = useOnline()
  const scrollPositions = useRef<Record<Tab, number>>({ watched: 0, watchlist: 0, search: 0, more: 0 })

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

  const overlayOpen = detail !== null || rating !== null || picking
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
      ...film, status: "watchlist", rating: null, answers: null, watchedAt: null, fromNotes: false, addedAt: new Date().toISOString(),
    }
    if (persist(() => addFilm(entry))) notify(`„${film.title}“ zur Watchlist hinzugefügt.`)
  }

  function saveRating(film: Film, result: RatingResult) {
    const existing = findSaved(film.tmdbId)
    const now = new Date().toISOString()
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
      setDetail((d) => ({ tmdbId: film.tmdbId, draft: null, instant: d?.tmdbId !== film.tmdbId }))
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
      addedAt: existing?.addedAt ?? new Date().toISOString(),
      // Wann genau, ist unbekannt – kein erfundenes Datum.
      watchedAt: existing?.status === "watched" ? existing.watchedAt : null,
    }
    if (persist(() => addFilm(updated))) {
      setRating(null)
      setDetail((d) => ({ tmdbId: film.tmdbId, draft: null, instant: d?.tmdbId !== film.tmdbId }))
      notify("Als gesehen gespeichert")
    }
  }

  function moveToWatchlist(film: Film) {
    if (!window.confirm(`„${film.title}“ zurück auf die Watchlist schieben? Bewertung und Antworten werden entfernt.`)) return
    if (persist(() => updateFilm(film.tmdbId, { status: "watchlist", rating: null, answers: null, watchedAt: null, fromNotes: false }))) {
      notify(`„${film.title}“ ist wieder auf der Watchlist.`)
    }
  }

  function deleteFilm(film: Film) {
    if (!window.confirm(`„${film.title}“ wirklich löschen?`)) return
    const snapshot = findSaved(film.tmdbId)
    if (persist(() => removeFilm(film.tmdbId))) {
      setDetail(null)
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

  function changeGridSize(gridSize: GridSize) {
    const next = { ...settings, gridSize }
    setSettings(next)
    saveSettings(next)
  }

  function onImported(result: ImportResult) {
    setStore(result.store)
  }

  const openSaved = (film: Film) => setDetail({ tmdbId: film.tmdbId, draft: null })
  const openDetail = (film: Film, saved: boolean) => setDetail({ tmdbId: film.tmdbId, draft: saved ? null : film })

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
        <div hidden={tab !== "search"}>
          <SearchView
            films={store.films}
            onAddToWatchlist={addToWatchlist}
            onRate={setRating}
            onOpenDetail={openDetail}
            onError={notify}
          />
        </div>
        <div hidden={tab !== "more"}>
          <MoreView store={store} onImported={onImported} gridSize={settings.gridSize} onGridSizeChange={changeGridSize} />
        </div>
      </main>

      <TabBar active={tab} onChange={changeTab} />

      {detailFilm && (
        <FilmDetail
          key={detailFilm.tmdbId}
          film={detailFilm}
          saved={savedDetail !== undefined}
          instant={detail?.instant}
          onClose={() => setDetail(null)}
          onRate={setRating}
          onAddToWatchlist={addToWatchlist}
          onMoveToWatchlist={moveToWatchlist}
          onDelete={deleteFilm}
          onSaveNote={saveNote}
          onSetFromNotes={setFromNotes}
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
