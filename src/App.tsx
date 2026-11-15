import { useEffect, useLayoutEffect, useRef, useState } from "react"
import type { Film, Store } from "./types"
import { addFilm, load, removeFilm, STORAGE_KEY, updateFilm, type ImportResult } from "./lib/storage"
import { formatRating } from "./lib/format"
import TabBar, { type Tab } from "./components/TabBar"
import SearchView from "./components/SearchView"
import WatchedView from "./components/WatchedView"
import WatchlistView from "./components/WatchlistView"
import MoreView from "./components/MoreView"
import FilmDetail from "./components/FilmDetail"
import RatingFlow, { type RatingResult } from "./components/RatingFlow"

interface Toast {
  id: number
  text: string
  undo?: () => void
}

function useOnline(): boolean {
  const [online, setOnline] = useState(() => navigator.onLine)
  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener("online", on)
    window.addEventListener("offline", off)
    return () => {
      window.removeEventListener("online", on)
      window.removeEventListener("offline", off)
    }
  }, [])
  return online
}

export default function App() {
  const [store, setStore] = useState<Store>(load)
  const [tab, setTab] = useState<Tab>("search")
  /** Geöffnete Detailansicht: gespeicherter Film (per tmdbId) oder Vorschau eines Suchtreffers (draft). */
  const [detail, setDetail] = useState<{ tmdbId: number; draft: Film | null } | null>(null)
  /** Film, der gerade bewertet wird. */
  const [rating, setRating] = useState<Film | null>(null)
  const [toast, setToast] = useState<Toast | null>(null)
  const online = useOnline()
  const scrollPositions = useRef<Record<Tab, number>>({ search: 0, watched: 0, watchlist: 0, more: 0 })

  // Änderungen aus anderen Browser-Tabs übernehmen.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY || e.key === null) setStore(load())
    }
    window.addEventListener("storage", onStorage)
    return () => window.removeEventListener("storage", onStorage)
  }, [])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), toast.undo ? 6000 : 3500)
    return () => clearTimeout(t)
  }, [toast])

  const overlayOpen = detail !== null || rating !== null
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
      note: result.note,
      addedAt: existing?.addedAt ?? now,
      // Beim ersten Markieren als gesehen = heute. Neu-Bewerten ändert das Datum nicht
      // (auch nicht bei importierten Filmen ohne bekanntes Datum).
      watchedAt: existing?.status === "watched" ? existing.watchedAt : now,
      // Jetzt in der App per Fragebogen bewertet.
      fromNotes: false,
    }
    if (persist(() => addFilm(updated))) {
      setRating(null)
      notify(`„${film.title}“ gespeichert: ★ ${formatRating(result.rating)}`)
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

  function onImported(result: ImportResult) {
    setStore(result.store)
  }

  const openSaved = (film: Film) => setDetail({ tmdbId: film.tmdbId, draft: null })
  const openDetail = (film: Film, saved: boolean) => setDetail({ tmdbId: film.tmdbId, draft: saved ? null : film })

  const savedDetail = detail ? findSaved(detail.tmdbId) : undefined
  const detailFilm = savedDetail ?? detail?.draft ?? null

  const watchedCount = store.films.filter((f) => f.status === "watched").length
  const counts = { watched: watchedCount, watchlist: store.films.length - watchedCount }

  return (
    <div className="app">
      <header className="app-header">
        <span className="logo">filmio</span>
        {!online && <span className="offline-pill">offline</span>}
      </header>

      <main className="main">
        <div hidden={tab !== "search"}>
          <SearchView
            films={store.films}
            online={online}
            onAddToWatchlist={addToWatchlist}
            onRate={setRating}
            onOpenDetail={openDetail}
            onError={notify}
          />
        </div>
        <div hidden={tab !== "watched"}>
          <WatchedView films={store.films} onOpen={openSaved} />
        </div>
        <div hidden={tab !== "watchlist"}>
          <WatchlistView films={store.films} onOpen={openSaved} onMarkWatched={setRating} />
        </div>
        <div hidden={tab !== "more"}>
          <MoreView store={store} onImported={onImported} />
        </div>
      </main>

      <TabBar active={tab} onChange={changeTab} counts={counts} />

      {detailFilm && (
        <FilmDetail
          key={detailFilm.tmdbId}
          film={detailFilm}
          saved={savedDetail !== undefined}
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
        />
      )}

      {toast && (
        <div className="toast" role="status" key={toast.id}>
          <span>{toast.text}</span>
          {toast.undo && <button type="button" className="btn-link" onClick={toast.undo}>Rückgängig</button>}
        </div>
      )}
    </div>
  )
}
