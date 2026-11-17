import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react"
import type { Answer, Film, MyCinema, Service } from "../types"
import { QUESTIONS } from "../lib/scoring"
import { formatDate, formatRating, formatRuntime, localDateStamp } from "../lib/format"
import { formatUpcomingLong, upcomingRelease } from "../lib/release"
import { newFilm } from "../lib/storage"
import { REGIONS, type Region } from "../lib/settings"
import {
  backdropUrl, hasToken, loadCollection, peekCollection, loadFilmInfo, loadMovieFull, peekMovieFull, posterUrl, smallImageUrl,
  type Collection, type MovieFull, type Provider, type TmdbListItem,
} from "../lib/tmdb"
import { useOnline } from "../hooks/useOnline"
import { useSwipeBack } from "../hooks/useSwipeBack"
import StarRating from "./StarRating"
import PosterRow from "./PosterRow"
import TagEditor from "./TagEditor"
import CinemaSessions from "./CinemaSessions"
import {
  IconBookmark, IconCalendar, IconCheck, IconChevronDown, IconChevronLeft, IconChevronRight, IconFlag, IconFlagFilled, IconHistory, IconList,
  IconMinus, IconMore, IconNote, IconPlay, IconPlus, IconRepeat, IconTrash, IconX,
} from "./Icons"
import { Poster } from "./FilmCard"

interface Props {
  film: Film
  /** false = Vorschau eines Films, der noch nicht gespeichert ist. */
  saved: boolean
  /** Ohne Einblend-Animation öffnen (z.B. nach der Sterne-Enthüllung oder beim Zurückgehen). */
  instant?: boolean
  /** Scroll-Position wiederherstellen (beim Zurückgehen aus einem anderen Film). */
  initialScroll?: number
  scrollerRef: RefObject<HTMLDivElement>
  region: Region
  /** Meine Streaming-Dienste – werden bei „Wo läuft der Film?“ hervorgehoben. */
  services: Service[]
  /** Mein Kino – zeigt dessen Spielzeiten, wenn der Film dort läuft. */
  cinema: MyCinema | null
  /** Alle gespeicherten Filme – für die Markierungen in Filmreihe und Empfehlungen. */
  films: Film[]
  onClose: () => void
  onRate: (film: Film) => void
  onAddToWatchlist: (film: Film) => void
  onAddManyToWatchlist: (films: Film[]) => void
  onMoveToWatchlist: (film: Film) => void
  onDelete: (film: Film) => void
  onSaveNote: (film: Film, note: string) => void
  onSetFromNotes: (film: Film, fromNotes: boolean) => void
  /** Als „früher gesehen“ speichern, ohne Bewertung. */
  onSaveWithoutRating: (film: Film) => void
  /** Einen anderen Film öffnen (aus Filmreihe oder Empfehlungen). */
  onOpenItem: (item: TmdbListItem) => void
  onTogglePriority: (film: Film) => void
  /** Weitere Male gesehen: neue Liste der Daten (ISO). */
  onSetRewatches: (film: Film, rewatches: string[]) => void
  onSetTags: (film: Film, tags: string[]) => void
}

/** "2026-11-17" → ISO um 12 Uhr Ortszeit (damit das Datum in keiner Zeitzone kippt). */
function dayToIso(day: string): string | null {
  const [y, m, d] = day.split("-").map(Number)
  if (!y || !m || !d) return null
  return new Date(y, m - 1, d, 12).toISOString()
}

const ANSWER_LABEL: Record<Answer, string> = { ja: "Ja", neutral: "Neutral", nein: "Nein" }
const ANSWER_ICON: Record<Answer, ReactNode> = { ja: <IconCheck />, neutral: <IconMinus />, nein: <IconX /> }

/** Großes Szenenbild oben. Fallbacks: Szenenbild → unscharfes Poster → Verlauf. */
function Hero({ film }: { film: Film }) {
  const [failed, setFailed] = useState<string | null>(null)
  const backdrop = film.backdropPath && failed !== film.backdropPath ? film.backdropPath : null
  if (backdrop) {
    return (
      <img
        className="hero-img"
        src={backdropUrl(backdrop, "w780")!}
        srcSet={`${backdropUrl(backdrop, "w780")} 780w, ${backdropUrl(backdrop, "w1280")} 1280w`}
        sizes="(max-width: 960px) 100vw, 960px"
        alt=""
        onError={() => setFailed(backdrop)}
      />
    )
  }
  if (film.posterPath && failed !== film.posterPath) {
    return <img className="hero-img hero-blur" src={posterUrl(film.posterPath, "w185")!} alt="" onError={() => setFailed(film.posterPath)} />
  }
  return <div className="hero-img hero-empty" />
}

function ProviderLogos({ label, providers, mine }: { label: string; providers: Provider[]; mine?: Set<number> }) {
  const isMine = (p: Provider) => mine?.has(p.id) ?? false
  // Meine Dienste zuerst.
  const sorted = [...providers].sort((a, b) => Number(isMine(b)) - Number(isMine(a)))
  return (
    <div className="providers">
      <span className="providers-label">{label}</span>
      <ul className="providers-list">
        {sorted.map((p) => (
          <li key={p.id} title={isMine(p) ? `${p.name} – dein Dienst` : p.name} className={isMine(p) ? "provider-mine" : undefined}>
            {p.logoPath
              ? <img src={smallImageUrl(p.logoPath, "w92")!} alt={p.name} loading="lazy" />
              : <span className="provider-fallback">{p.name}</span>}
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Porträt mit Platzhalter (Initialen), falls kein Bild da oder nicht ladbar ist. */
function Portrait({ path, name }: { path: string | null; name: string }) {
  const [failed, setFailed] = useState(false)
  if (!path || failed) {
    const initials = name.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase()
    return <span className="portrait portrait-empty" aria-hidden="true">{initials}</span>
  }
  return <img className="portrait" src={smallImageUrl(path, "w185")!} alt="" loading="lazy" onError={() => setFailed(true)} />
}

export default function FilmDetail({
  film, saved, instant = false, initialScroll = 0, scrollerRef, region, services, cinema, films,
  onClose, onRate, onAddToWatchlist, onAddManyToWatchlist, onMoveToWatchlist, onDelete, onSaveNote, onSetFromNotes,
  onSaveWithoutRating, onOpenItem, onTogglePriority, onSetRewatches, onSetTags,
}: Props) {
  const online = useOnline()
  useSwipeBack(scrollerRef, onClose)

  // Zusatzinfos von TMDB (Besetzung, Anbieter, Filmreihe …) – für nicht gespeicherte Filme auch die Stammdaten.
  const [full, setFull] = useState<MovieFull | null>(() => peekMovieFull(film.tmdbId))
  const [loadFailed, setLoadFailed] = useState(false)
  useEffect(() => {
    if (full || !hasToken || !online) return
    let cancelled = false
    loadMovieFull(film.tmdbId).then(
      (f) => { if (!cancelled) { setFull(f); setLoadFailed(false) } },
      () => { if (!cancelled) setLoadFailed(true) },
    )
    return () => { cancelled = true }
  }, [film.tmdbId, online, full])

  const collectionId = full?.extras.collection?.id ?? null
  // Schon geladene Reihe sofort zeigen – sonst stimmt beim Zurückgehen die Seitenhöhe (und damit die Scroll-Position) nicht.
  const [collection, setCollection] = useState<Collection | null>(() => (collectionId === null ? null : peekCollection(collectionId)))
  useEffect(() => {
    if (collectionId === null || collection?.id === collectionId) return
    let cancelled = false
    loadCollection(collectionId).then((c) => { if (!cancelled) setCollection(c) }, () => {})
    return () => { cancelled = true }
  }, [collectionId, collection?.id])

  useLayoutEffect(() => {
    if (initialScroll && scrollerRef.current) scrollerRef.current.scrollTop = initialScroll
  }, [initialScroll, scrollerRef])

  const [note, setNote] = useState(film.note)
  const [noteFor, setNoteFor] = useState(film.note)
  // Wenn sich die gespeicherte Notiz ändert, Feld nachziehen.
  if (film.note !== noteFor) {
    setNoteFor(film.note)
    setNote(film.note)
  }
  const [expanded, setExpanded] = useState(false)
  /** „•••“-Menü offen; "lists" = Unterseite „Zu Liste hinzufügen“. */
  const [menu, setMenu] = useState<null | "main" | "lists">(null)
  /** Notiz wird gerade geschrieben/bearbeitet. */
  const [editingNote, setEditingNote] = useState(false)
  // Handlung: 3 Zeilen; „Mehr“ nur, wenn der Text wirklich länger ist.
  const overviewRef = useRef<HTMLParagraphElement>(null)
  const [overflows, setOverflows] = useState(false)
  const [addingParts, setAddingParts] = useState(false)

  /** Angezeigte Daten: gespeicherter Film, sonst die Vorschau – ergänzt, sobald TMDB geantwortet hat. */
  const view: Film = saved || !full ? film : { ...film, ...full.info }
  /** Für Aktionen an einem noch nicht gespeicherten Film braucht es die vollständigen Daten. */
  const draft = saved ? film : full ? newFilm(full.info) : null

  const watched = saved && film.status === "watched"
  /** Gesehen, aber ohne Bewertung → Tab „Früher“. */
  const earlier = watched && film.rating === null
  const meta = [view.year, formatRuntime(view.runtime)].filter(Boolean).join(" · ")
  const counts = film.answers?.reduce(
    (c, a) => ({ ...c, [a]: c[a] + 1 }), { ja: 0, neutral: 0, nein: 0 } as Record<Answer, number>)

  const extras = full?.extras
  const watch = extras?.watch[region]
  const myIds = new Set(services.flatMap((s) => s.ids))
  const onMyService = watch?.stream.some((p) => myIds.has(p.id)) ?? false
  const upcoming = film.status === "watched" && saved ? null
    : upcomingRelease({ release: film.release ?? full?.info.release, year: view.year }, region)
  const rewatches = film.rewatches ?? []
  const allTags = [...new Set(films.flatMap((f) => f.tags ?? []))].sort((a, b) => a.localeCompare(b, "de"))
  const regionLabel = REGIONS.find((r) => r.id === region)?.label ?? region


  const savedById = new Map(films.map((f) => [f.tmdbId, f]))
  const parts = collection?.parts ?? []
  const seenParts = parts.filter((p) => savedById.get(p.id)?.status === "watched").length
  const missingParts = parts.filter((p) => !savedById.has(p.id) && p.release_date)

  async function addMissingParts() {
    if (addingParts) return
    setAddingParts(true)
    try {
      const infos = await Promise.all(missingParts.map((p) => loadFilmInfo(p.id).catch(() => null)))
      onAddManyToWatchlist(infos.filter((i) => i !== null).map((i) => newFilm(i)))
    } finally {
      setAddingParts(false)
    }
  }

  useLayoutEffect(() => {
    const el = overviewRef.current
    if (!el || expanded) return
    const check = () => setOverflows(el.scrollHeight > el.clientHeight + 1)
    check()
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(check) : null
    ro?.observe(el)
    return () => ro?.disconnect()
  }, [view.overview, expanded])

  const ratingStars = watched && film.rating !== null
  const tags = film.tags ?? []
  const hasMine = saved && (film.note !== "" || editingNote || tags.length > 0 || rewatches.length > 0)
  const genresText = view.genres.slice(0, 3).join(", ")
  const metaLine = [meta, genresText].filter(Boolean).join(" · ")

  /** Hauptknopf + weitere Aktionen – alle in derselben Form. */
  const primary = (
    <button type="button" className="d-btn d-btn-primary" disabled={!draft} onClick={() => draft && onRate(draft)}>
      <IconCheck />
      <span>{watched ? (earlier ? "Jetzt bewerten" : "Neu bewerten") : "Gesehen – jetzt bewerten"}</span>
    </button>
  )
  const secondary: ReactNode[] = []
  if (!saved) {
    secondary.push(
      <button key="wl" type="button" className="d-btn" disabled={!draft} onClick={() => draft && onAddToWatchlist(draft)}>
        <IconPlus /><span>Watchlist</span>
      </button>,
    )
  }
  if (saved && !watched) {
    secondary.push(
      <button key="prio" type="button" className={`d-btn${film.priority ? " d-btn-on" : ""}`} aria-pressed={!!film.priority} onClick={() => onTogglePriority(film)}>
        {film.priority ? <IconFlagFilled /> : <IconFlag />}<span>Priorität</span>
      </button>,
    )
  }
  if (!watched) {
    secondary.push(
      <button key="earlier" type="button" className="d-btn" disabled={!draft} onClick={() => draft && onSaveWithoutRating(draft)}>
        <IconHistory /><span>Früher gesehen</span>
      </button>,
    )
  }
  if (watched) {
    secondary.push(
      <button key="again" type="button" className="d-btn" onClick={() => onSetRewatches(film, [...rewatches, new Date().toISOString()])}>
        <IconRepeat /><span>Nochmal gesehen</span>
      </button>,
    )
  }
  if (extras?.trailerUrl) {
    secondary.push(
      <a key="trailer" className="d-btn" href={extras.trailerUrl} target="_blank" rel="noopener noreferrer">
        <IconPlay /><span>Trailer</span>
      </a>,
    )
  }

  const heroText = (
    <div className="d-hero-text">
      {saved && <span className="hero-status">{earlier ? "Früher gesehen" : film.status === "watched" ? "Gesehen" : "Watchlist"}</span>}
      <h2 className="detail-title">{view.title}</h2>
      {metaLine && <p className="detail-meta">{metaLine}</p>}
      {ratingStars && (
        <p className="d-rating">
          <StarRating value={film.rating!} size={20} />
          <span className="d-rating-num">{formatRating(film.rating!)}</span>
          {film.fromNotes && <span className="d-rating-note"><IconNote />aus Notizen</span>}
        </p>
      )}
      {upcoming && <p className="release-chip"><IconCalendar />{formatUpcomingLong(upcoming)}</p>}
    </div>
  )

  return (
    <div
      className={`overlay detail d-new${instant ? "" : " detail-enter"}`}
      role="dialog"
      aria-modal="true"
      aria-label={view.title}
      ref={scrollerRef}
    >
      {/* Szenenbild läuft dezent verschwommen hinter der Seite weiter */}
      {(view.backdropPath || view.posterPath) && (
        <div className="d-ambient" aria-hidden="true">
          <img src={view.backdropPath ? backdropUrl(view.backdropPath, "w780")! : posterUrl(view.posterPath, "w185")!} alt="" />
        </div>
      )}

      <div className="d-hero">
        <div className="d-hero-img"><Hero film={view} /></div>
        <button type="button" className="glass-btn back-btn" onClick={onClose} aria-label="Zurück"><IconChevronLeft /></button>
        {saved && (
          <button type="button" className="glass-btn d-more-btn" onClick={() => setMenu("main")} aria-label="Weitere Aktionen">
            <IconMore />
          </button>
        )}
      </div>
      <div className="d-hero-c">
        <div className="d-hero-poster"><Poster path={view.posterPath} title={view.title} /></div>
        {heroText}
      </div>

      <div className="d-body">
        <div className="d-actions d-actions-two">
          {primary}
          {secondary.length > 0 && <div className="d-actions-row" style={{ gridTemplateColumns: `repeat(${secondary.length}, 1fr)` }}>{secondary}</div>}
        </div>

        {!saved && !full && loadFailed && (
          <p className="notice notice-error" role="alert">Die Filmdetails konnten nicht geladen werden. Bist du online?</p>
        )}

        {(extras?.tagline || view.overview) && (
          <section className="d-section">
            <h3>Handlung</h3>
            {expanded && extras?.tagline && <p className="tagline">{extras.tagline}</p>}
            {view.overview ? (
              <p ref={overviewRef} className={`overview${expanded ? "" : " d-clamp3"}`}>{view.overview}</p>
            ) : !expanded && extras?.tagline && <p className="tagline">{extras.tagline}</p>}
            {(overflows || expanded || (extras?.tagline && view.overview)) && (
              <button type="button" className="text-btn text-btn-inline more-btn" onClick={() => setExpanded((e) => !e)}>
                {expanded ? "Weniger" : "Mehr"}
              </button>
            )}
          </section>
        )}

        {hasMine && (
          <section className="d-section d-mine">
            <h3>Deins</h3>
            {editingNote ? (
              <div className="note-edit">
                <textarea
                  className="note-field"
                  aria-label="Notiz"
                  value={note}
                  rows={3}
                  autoFocus
                  placeholder="Was willst du dir zu dem Film merken?"
                  onChange={(e) => setNote(e.target.value)}
                />
                <div className="note-actions">
                  <button type="button" className="btn btn-small btn-primary" onClick={() => { onSaveNote(film, note.trim()); setEditingNote(false) }}>
                    Notiz speichern
                  </button>
                  <button type="button" className="text-btn" onClick={() => { setNote(film.note); setEditingNote(false) }}>Abbrechen</button>
                </div>
              </div>
            ) : film.note && (
              <button type="button" className="d-note" onClick={() => setEditingNote(true)} aria-label="Notiz bearbeiten">
                <IconNote /><span>{film.note}</span>
              </button>
            )}
            {tags.length > 0 && (
              <ul className="tag-list d-tags">
                {tags.map((t) => (
                  <li key={t} className="tag">
                    <span>{t}</span>
                    <button type="button" className="tag-remove" aria-label={`Aus „${t}“ entfernen`} onClick={() => onSetTags(film, tags.filter((x) => x !== t))}>
                      <IconX />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {watched && rewatches.length > 0 && (
              <>
                <p className="d-sub">{rewatches.length + 1}× gesehen</p>
                <ul className="viewings">
                  <li>
                    <span className="viewing-label">Zum ersten Mal</span>
                    <span className="viewing-date">{formatDate(film.watchedAt) ?? "Datum unbekannt"}</span>
                  </li>
                  {rewatches.map((iso, i) => (
                    <li key={i}>
                      <span className="viewing-label">{i + 2}. Mal</span>
                      <input
                        type="date"
                        className="viewing-input"
                        aria-label={`Datum ${i + 2}. Mal`}
                        value={localDateStamp(new Date(iso))}
                        max={localDateStamp()}
                        onChange={(e) => {
                          const next = dayToIso(e.target.value)
                          if (next) onSetRewatches(film, rewatches.map((r, j) => (j === i ? next : r)))
                        }}
                      />
                      <button type="button" className="viewing-remove" aria-label={`${i + 2}. Mal entfernen`} onClick={() => onSetRewatches(film, rewatches.filter((_, j) => j !== i))}>
                        <IconX />
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
        )}

        {cinema && (
          <CinemaSessions cinema={cinema} film={{ title: view.title, year: view.year, originalTitle: extras?.originalTitle }} />
        )}

        {watch && (
          <section className="d-section">
            <div className="section-head">
              <h3>Wo läuft der Film?</h3>
              {(watch.stream.length > 0 || watch.rentBuy.length > 0) && <span className="section-note">Quelle: JustWatch</span>}
            </div>
            {watch.stream.length === 0 && watch.rentBuy.length === 0 ? (
              <p className="hint">In {regionLabel} derzeit bei keinem Anbieter.</p>
            ) : (
              <a className="providers-link" href={watch.link ?? undefined} target="_blank" rel="noopener noreferrer">
                {watch.stream.length > 0 && <ProviderLogos label={onMyService ? "Im Abo · läuft bei dir" : "Im Abo"} providers={watch.stream} mine={myIds} />}
                {watch.rentBuy.length > 0 && <ProviderLogos label="Leihen oder kaufen" providers={watch.rentBuy} />}
              </a>
            )}
          </section>
        )}

        {extras && (extras.cast.length > 0 || extras.directors.length > 0) && (
          <section className="d-section">
            <h3>Besetzung</h3>
            {extras.directors.length > 0 && <p className="directors">Regie: {extras.directors.join(", ")}</p>}
            {extras.cast.length > 0 && (
              <ul className="cast-row">
                {extras.cast.map((c) => (
                  <li key={c.id}>
                    <Portrait path={c.profilePath} name={c.name} />
                    <span className="cast-name">{c.name}</span>
                    {c.character && <span className="cast-role">{c.character}</span>}
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {collection && parts.length > 1 && (
          <PosterRow
            level={3}
            title={collection.name}
            note={`${seenParts} von ${parts.length} gesehen`}
            items={parts}
            films={films}
            onOpen={onOpenItem}
            showTitles
            currentId={film.tmdbId}
          >
            {missingParts.length > 0 && (
              <button type="button" className="text-btn row-action" disabled={addingParts} onClick={() => void addMissingParts()}>
                <IconPlus />{addingParts ? "Wird hinzugefügt …" : `Fehlende auf die Watchlist (${missingParts.length})`}
              </button>
            )}
          </PosterRow>
        )}

        {extras && extras.recommendations.length > 0 && (
          <PosterRow level={3} title="Ähnliche Filme" items={extras.recommendations.slice(0, 15)} films={films} onOpen={onOpenItem} />
        )}

        {saved && (
          <details className="d-section d-more">
            <summary><h3>Mehr Infos</h3><IconChevronDown className="d-more-chevron" /></summary>
            <p className="detail-dates">
              Hinzugefügt am {formatDate(film.addedAt)}
              {watched && film.watchedAt && <> · Gesehen am {formatDate(film.watchedAt)}</>}
            </p>
            {watched && film.answers && counts && (
              <>
                <p className="d-sub">Antwortprofil · Ja {counts.ja} · Neutral {counts.neutral} · Nein {counts.nein}</p>
                <ol className="answer-profile">
                  {QUESTIONS.map((q, i) => {
                    const a = film.answers![i]
                    return (
                      <li key={q} className={`profile-${a}`}>
                        <span className="profile-icon">{ANSWER_ICON[a]}</span>
                        <span className="profile-question">{q}</span>
                        <span className="profile-answer">{ANSWER_LABEL[a]}</span>
                      </li>
                    )
                  })}
                </ol>
              </>
            )}
          </details>
        )}
      </div>

      {menu && saved && (
        <div className="sheet-backdrop" onClick={(e) => { if (e.target === e.currentTarget) setMenu(null) }}>
          <div className="sheet" role="dialog" aria-label={menu === "lists" ? "Zu Liste hinzufügen" : "Weitere Aktionen"}>
            <div className="sheet-grip" aria-hidden="true" />
            {menu === "main" ? (
              <>
                <p className="sheet-title">{view.title}</p>
                <div className="sheet-group">
                  <button type="button" className="sheet-row" onClick={() => { setMenu(null); setNote(film.note); setEditingNote(true) }}>
                    <IconNote /><span>{film.note ? "Notiz bearbeiten" : "Notiz hinzufügen"}</span>
                  </button>
                  <button type="button" className="sheet-row" onClick={() => setMenu("lists")}>
                    <IconList /><span>Zu Liste hinzufügen</span><IconChevronRight className="sheet-chevron" />
                  </button>
                  {watched && film.rating !== null && (
                    <button type="button" className="sheet-row" role="menuitemcheckbox" aria-checked={film.fromNotes} onClick={() => onSetFromNotes(film, !film.fromNotes)}>
                      <IconNote /><span>Aus meinen Notizen bewertet</span>
                      <span className={`service-check${film.fromNotes ? " on" : ""}`} aria-hidden="true">{film.fromNotes && <IconCheck />}</span>
                    </button>
                  )}
                  {watched && (
                    <button type="button" className="sheet-row" onClick={() => { setMenu(null); onMoveToWatchlist(film) }}>
                      <IconBookmark /><span>Zurück auf die Watchlist</span>
                    </button>
                  )}
                </div>
                <div className="sheet-group">
                  <button type="button" className="sheet-row sheet-danger" onClick={() => { setMenu(null); onDelete(film) }}>
                    <IconTrash /><span>Löschen</span>
                  </button>
                </div>
                <button type="button" className="sheet-cancel" onClick={() => setMenu(null)}>Abbrechen</button>
              </>
            ) : (
              <>
                <div className="sheet-head">
                  <button type="button" className="text-btn" onClick={() => setMenu("main")}><IconChevronLeft />Zurück</button>
                  <p className="sheet-title">Listen</p>
                  <button type="button" className="text-btn" onClick={() => setMenu(null)}>Fertig</button>
                </div>
                <TagEditor tags={tags} allTags={allTags} onChange={(t) => onSetTags(film, t)} />
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
