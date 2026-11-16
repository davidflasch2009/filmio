import { useEffect, useLayoutEffect, useState, type ReactNode, type RefObject } from "react"
import type { Answer, Film } from "../types"
import { QUESTIONS } from "../lib/scoring"
import { formatDate, formatRating, formatRuntime } from "../lib/format"
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
import { IconBookmark, IconCheck, IconChevronLeft, IconHistory, IconMinus, IconPlay, IconPlus, IconTrash, IconX } from "./Icons"

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

function ProviderLogos({ label, providers }: { label: string; providers: Provider[] }) {
  return (
    <div className="providers">
      <span className="providers-label">{label}</span>
      <ul className="providers-list">
        {providers.map((p) => (
          <li key={p.id} title={p.name}>
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
  film, saved, instant = false, initialScroll = 0, scrollerRef, region, films,
  onClose, onRate, onAddToWatchlist, onAddManyToWatchlist, onMoveToWatchlist, onDelete, onSaveNote, onSetFromNotes,
  onSaveWithoutRating, onOpenItem,
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
  const [noteSaved, setNoteSaved] = useState(false)
  // Wenn sich die gespeicherte Notiz ändert, Feld nachziehen.
  if (film.note !== noteFor) {
    setNoteFor(film.note)
    setNote(film.note)
  }
  const [expanded, setExpanded] = useState(false)
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
  const regionLabel = REGIONS.find((r) => r.id === region)?.label ?? region
  const longOverview = view.overview.length > 320

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

  return (
    <div className={`overlay detail${instant ? "" : " detail-enter"}`} role="dialog" aria-modal="true" aria-label={view.title} ref={scrollerRef}>
      <div className="hero">
        <Hero film={view} />
        <button type="button" className="glass-btn back-btn" onClick={onClose} aria-label="Zurück"><IconChevronLeft /></button>
        <div className="hero-text">
          {saved && <span className="hero-status">{earlier ? "Früher gesehen" : film.status === "watched" ? "Gesehen" : "Watchlist"}</span>}
          <h2 className="detail-title">{view.title}</h2>
          {meta && <p className="detail-meta">{meta}</p>}
        </div>
      </div>

      <div className="detail-body">
        {view.genres.length > 0 && <p className="detail-genres">{view.genres.join(" · ")}</p>}

        {watched && film.rating !== null && (
          <div className="rating-card">
            <div className="detail-rating">
              <StarRating value={film.rating} size={26} />
              <span className="detail-rating-num">{formatRating(film.rating)}</span>
            </div>
            <label className="check">
              <input type="checkbox" checked={film.fromNotes} onChange={(e) => onSetFromNotes(film, e.target.checked)} />
              <span>Aus meinen Notizen – nicht in der App bewertet</span>
            </label>
          </div>
        )}

        <div className="detail-actions">
          <button type="button" className="btn btn-primary btn-block" disabled={!draft} onClick={() => draft && onRate(draft)}>
            {watched ? (earlier ? "Jetzt bewerten" : "Neu bewerten") : <><IconCheck />Gesehen – jetzt bewerten</>}
          </button>
          <div className="action-row">
            {!saved && (
              <button type="button" className="action-btn" disabled={!draft} onClick={() => draft && onAddToWatchlist(draft)}>
                <IconPlus /><span>Watchlist</span>
              </button>
            )}
            {!watched && (
              <button type="button" className="action-btn" disabled={!draft} onClick={() => draft && onSaveWithoutRating(draft)}>
                <IconHistory /><span>Früher gesehen</span>
              </button>
            )}
            {watched && (
              <button type="button" className="action-btn" onClick={() => onMoveToWatchlist(film)}>
                <IconBookmark /><span>Auf Watchlist</span>
              </button>
            )}
            {extras?.trailerUrl && (
              <a className="action-btn" href={extras.trailerUrl} target="_blank" rel="noopener noreferrer">
                <IconPlay /><span>Trailer</span>
              </a>
            )}
          </div>
        </div>

        {!saved && !full && loadFailed && (
          <p className="notice notice-error" role="alert">Die Filmdetails konnten nicht geladen werden. Bist du online?</p>
        )}

        {(extras?.tagline || view.overview) && (
          <section className="detail-section">
            <h3>Handlung</h3>
            {extras?.tagline && <p className="tagline">{extras.tagline}</p>}
            {view.overview && (
              <p className={`overview${longOverview && !expanded ? " overview-clamped" : ""}`}>{view.overview}</p>
            )}
            {longOverview && (
              <button type="button" className="text-btn text-btn-inline more-btn" onClick={() => setExpanded((e) => !e)}>
                {expanded ? "Weniger" : "Mehr"}
              </button>
            )}
          </section>
        )}

        {watched && (
          <section className="detail-section">
            <h3>Notiz</h3>
            <textarea
              className="note-field"
              aria-label="Notiz"
              value={note}
              rows={3}
              placeholder="Was willst du dir zu dem Film merken?"
              onChange={(e) => { setNote(e.target.value); setNoteSaved(false) }}
            />
            <div className="note-actions">
              <button
                type="button"
                className="btn btn-small"
                disabled={note.trim() === film.note}
                onClick={() => { onSaveNote(film, note.trim()); setNoteSaved(true) }}
              >
                Notiz speichern
              </button>
              {noteSaved && note.trim() === film.note && <span className="hint">Gespeichert ✓</span>}
            </div>
          </section>
        )}

        {watched && film.answers && counts && (
          <details className="detail-section profile-details">
            <summary>
              <h3>Antwortprofil</h3>
              <span className="profile-counts">Ja {counts.ja} · Neutral {counts.neutral} · Nein {counts.nein}</span>
            </summary>
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
          </details>
        )}

        {watch && (
          <section className="detail-section">
            <div className="section-head">
              <h3>Wo läuft der Film?</h3>
              {(watch.stream.length > 0 || watch.rentBuy.length > 0) && <span className="section-note">Quelle: JustWatch</span>}
            </div>
            {watch.stream.length === 0 && watch.rentBuy.length === 0 ? (
              <p className="hint">In {regionLabel} derzeit bei keinem Anbieter.</p>
            ) : (
              <a className="providers-link" href={watch.link ?? undefined} target="_blank" rel="noopener noreferrer">
                {watch.stream.length > 0 && <ProviderLogos label="Im Abo" providers={watch.stream} />}
                {watch.rentBuy.length > 0 && <ProviderLogos label="Leihen oder kaufen" providers={watch.rentBuy} />}
              </a>
            )}
          </section>
        )}

        {extras && (extras.cast.length > 0 || extras.directors.length > 0) && (
          <section className="detail-section">
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
          <footer className="detail-footer">
            <p className="detail-dates">
              Hinzugefügt am {formatDate(film.addedAt)}
              {watched && film.watchedAt && <> · Gesehen am {formatDate(film.watchedAt)}</>}
            </p>
            <button type="button" className="text-btn delete-btn" onClick={() => onDelete(film)}><IconTrash />Löschen</button>
          </footer>
        )}
      </div>
    </div>
  )
}
