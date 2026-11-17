import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import type { Film, Service, Store } from "./types"
import { addFilm, cleanTags, load, newFilm, removeFilm, setServices, STORAGE_KEY, updateFilm, updateMany, type ImportResult } from "./lib/storage"
import { formatRating } from "./lib/format"
import { fetchFilmMeta, hasToken, listItemToInfo, type TmdbListItem } from "./lib/tmdb"
import { releaseNeedsRefresh, upcomingRelease } from "./lib/release"
import { useStreams } from "./hooks/useStreams"
import ServicesPicker from "./components/ServicesPicker"
import ListsView from "./components/ListsView"
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
import LoginScreen from "./components/LoginScreen"
import { loadSession, onSessionChange, signOut, type Session } from "./lib/cloud"
import { resetSyncState, startSync } from "./lib/sync"

/** Zeitstempel für neue Einträge (außerhalb der Komponente, damit klar ist: nur in Ereignissen benutzt). */
const nowIso = () => new Date().toISOString()
const nowMs = () => Date.now()

/** Ziel aus einer Mitteilung: ?film=123 öffnet den Film, ?tab=watchlist die Watchlist. */
interface DeepLink { film: number | null; tab: Tab | null }

function parseLink(href: string): DeepLink | null {
  const u = new URL(href, window.location.href)
  const film = Number(u.searchParams.get("film")) || null
  const tab = u.searchParams.get("tab") === "watchlist" ? "watchlist" : null
  return film || tab ? { film, tab } : null
}

/** Beim Start aus einer Mitteilung: Ziel merken und die Adresse wieder aufräumen. */
const START_LINK = (() => {
  const link = parseLink(window.location.href)
  if (link) window.history.replaceState(null, "", window.location.pathname)
  return link
})()

/** Tab, in dem ein gespeicherter Film steht. */
function tabOf(film: Film): Tab {
  return film.status === "watchlist" ? "watchlist" : film.rating === null ? "earlier" : "watched"
}

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

/** Ohne Anmeldung keine App: erst der Anmelde-Bildschirm, danach filmio. */
export default function App() {
  const [session, setSession] = useState<Session | null>(loadSession)

  // Abgelaufene Anmeldung (oder Abmelden auf diesem Gerät) → zurück zum Anmelde-Bildschirm.
  useEffect(() => onSessionChange(setSession), [])
  const signedOut = useCallback(() => setSession(null), [])

  if (!session) return <LoginScreen onSignedIn={setSession} />
  return <FilmApp account={session.name} onSignOut={signedOut} />
}

function FilmApp({ account, onSignOut }: { account: string; onSignOut: () => void }) {
  const [store, setStore] = useState<Store>(load)
  const [tab, setTab] = useState<Tab>(() => {
    const saved = START_LINK?.film ? load().films.find((f) => f.tmdbId === START_LINK.film) : undefined
    return saved ? tabOf(saved) : START_LINK?.tab ?? "watched"
  })
  const [settings, setSettings] = useState(loadSettings)
  /** Stapel der geöffneten Detailseiten; die oberste wird angezeigt. */
  const [details, setDetails] = useState<DetailEntry[]>(() =>
    START_LINK?.film && load().films.some((f) => f.tmdbId === START_LINK.film) ? [{ tmdbId: START_LINK.film, draft: null, instant: true }] : [])
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

  // Mitteilung angetippt, während die App schon offen war.
  useEffect(() => {
    const sw = navigator.serviceWorker
    if (!sw) return
    const onMessage = (e: MessageEvent) => {
      const data = e.data as { type?: string; url?: string } | null
      if (data?.type !== "filmio-open" || !data.url) return
      const link = parseLink(data.url)
      if (!link) return
      setRating(null)
      setPicking(false)
      setStatsOpen(false)
      setServicesOpen(false)
      setListsOpen(false)
      const saved = link.film ? load().films.find((f) => f.tmdbId === link.film) : undefined
      if (saved) {
        setTab(tabOf(saved))
        setDetails([{ tmdbId: saved.tmdbId, draft: null }])
      } else {
        setDetails([])
        if (link.tab) setTab(link.tab)
      }
    }
    sw.addEventListener("message", onMessage)
    return () => sw.removeEventListener("message", onMessage)
  }, [])

  // Abgleich mit den anderen Geräten. Übernommene Änderungen frisch aus dem Speicher lesen –
  // so geht keine Eingabe verloren, die während des Abgleichs passiert ist.
  useEffect(() => startSync({ onRemoteChange: () => setStore(load()), onSignedOut: onSignOut }), [onSignOut])

  // Szenenbilder für Filme nachladen, die noch keins haben (z.B. aus einem Import oder älteren Versionen).
  // Ebenso die Erscheinungstermine – bei Filmen, die noch nicht draußen sind, alle paar Tage neu (Termine verschieben sich).
  // Beides zählt nicht als eigene Änderung (touch: false).
  const region = settings.region
  const needsMeta = (f: Film) => f.backdropPath === undefined || releaseNeedsRefresh(f, region)
  const metaPending = store.films.some(needsMeta)
  useEffect(() => {
    if (!online || !hasToken || !metaPending) return
    let cancelled = false
    const queue = load().films.filter(needsMeta).map((f) => f.tmdbId)
    const worker = async () => {
      while (queue.length && !cancelled) {
        const id = queue.shift()!
        try {
          const meta = await fetchFilmMeta(id)
          if (cancelled) return
          // Gibt es den Film bei TMDB nicht (mehr), nicht endlos weiterfragen.
          const patch = meta ?? { backdropPath: null, release: { date: null, local: {}, pending: false, checkedAt: new Date().toISOString() } }
          setStore(updateFilm(id, patch, { touch: false }))
        } catch {
          // Netzfehler o.ä.: beim nächsten Start erneut versuchen.
        }
      }
    }
    void Promise.all([worker(), worker(), worker()])
    return () => { cancelled = true }
    // needsMeta hängt nur von region ab.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online, metaPending, region])

  // Meine Streaming-Dienste und wo die Watchlist-Filme gerade laufen.
  const services = useMemo<Service[]>(() => store.services?.list ?? [], [store.services])
  const streams = useStreams(store.films, services, region, online)
  const [servicesOpen, setServicesOpen] = useState(false)
  const [listsOpen, setListsOpen] = useState(false)

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), toast.undo ? 6000 : 3500)
    return () => clearTimeout(t)
  }, [toast])

  const overlayOpen = details.length > 0 || rating !== null || picking || statsOpen || servicesOpen || listsOpen
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
      priority: undefined,
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
      priority: undefined,
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
    if (persist(() => updateFilm(film.tmdbId, { status: "watchlist", rating: null, answers: null, watchedAt: null, fromNotes: false, rewatches: [] }))) {
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

  function togglePriority(film: Film) {
    if (persist(() => updateFilm(film.tmdbId, { priority: film.priority ? undefined : true }))) {
      notify(film.priority ? "Priorität entfernt" : `„${film.title}“ steht jetzt oben auf der Watchlist.`)
    }
  }

  function setRewatches(film: Film, rewatches: string[]) {
    const added = rewatches.length > (film.rewatches?.length ?? 0)
    const sorted = [...rewatches].sort()
    if (persist(() => updateFilm(film.tmdbId, { rewatches: sorted })) && added) {
      notify(`${sorted.length + 1}× gesehen`, () => { if (persist(() => updateFilm(film.tmdbId, { rewatches: film.rewatches ?? [] }))) setToast(null) })
    }
  }

  function setTags(film: Film, tags: string[]) {
    const clean = cleanTags(tags)
    persist(() => updateFilm(film.tmdbId, { tags: clean.length ? clean : undefined }))
  }

  /** Liste umbenennen – heißt eine andere schon so, werden beide zusammengelegt. */
  function renameTag(from: string, to: string) {
    persist(() => updateMany((f) => (f.tags?.includes(from) ? { tags: cleanTags(f.tags.map((t) => (t === from ? to : t))) } : null)))
  }

  function deleteTag(tag: string) {
    const without = (tags: string[]) => { const rest = tags.filter((t) => t !== tag); return rest.length ? rest : undefined }
    if (persist(() => updateMany((f) => (f.tags?.includes(tag) ? { tags: without(f.tags) } : null)))) {
      notify(`Liste „${tag}“ gelöscht`)
    }
  }

  function changeServices(list: Service[]) {
    persist(() => setServices(list))
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

  async function logOut() {
    if (!window.confirm("Auf diesem Gerät abmelden? Zum Weiterverwenden musst du dich wieder anmelden.")) return
    resetSyncState()
    await signOut()
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
            region={region}
            services={services}
            streams={streams}
            onOpen={openSaved}
            onMarkWatched={setRating}
            onFindFilms={() => changeTab("search")}
            onRandom={() => setPicking(true)}
            onOpenServices={() => setServicesOpen(true)}
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
          <MoreView
            store={store}
            account={account}
            onSignOut={logOut}
            onImported={onImported}
            settings={settings}
            onSettingsChange={changeSettings}
            onOpenStats={() => setStatsOpen(true)}
            services={services}
            onOpenServices={() => setServicesOpen(true)}
            onOpenLists={() => setListsOpen(true)}
          />
        </div>
      </main>

      <TabBar active={tab} onChange={changeTab} />

      {statsOpen && <StatsView films={store.films} onClose={() => setStatsOpen(false)} onOpen={openSaved} />}

      {listsOpen && (
        <ListsView films={store.films} onOpen={openSaved} onRename={renameTag} onDelete={deleteTag} onClose={() => setListsOpen(false)} />
      )}

      {servicesOpen && (
        <ServicesPicker selected={services} region={region} onChange={changeServices} onClose={() => setServicesOpen(false)} />
      )}

      {detailFilm && (
        <FilmDetail
          key={`${details.length}-${detailFilm.tmdbId}`}
          film={detailFilm}
          saved={savedDetail !== undefined}
          instant={detail?.instant}
          initialScroll={detail?.scroll}
          scrollerRef={detailRef}
          region={settings.region}
          services={services}
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
          onTogglePriority={togglePriority}
          onSetRewatches={setRewatches}
          onSetTags={setTags}
        />
      )}

      {rating && (
        <RatingFlow
          key={rating.tmdbId}
          film={findSaved(rating.tmdbId) ?? rating}
          onCancel={() => setRating(null)}
          onSave={(result) => saveRating(rating, result)}
          onSaveWithoutRating={() => saveWithoutRating(rating)}
          showHelp={settings.questionHelp}
        />
      )}

      {picking && (
        <RandomPick
          films={store.films.filter((f) => f.status === "watchlist" && !upcomingRelease(f, region))}
          streams={streams}
          hasServices={services.length > 0}
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
