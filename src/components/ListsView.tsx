import { useMemo, useRef, useState } from "react"
import type { Film } from "../types"
import { useSwipeBack } from "../hooks/useSwipeBack"
import FilmCard, { Poster } from "./FilmCard"
import { IconChevronLeft, IconChevronRight, IconTrash } from "./Icons"

interface Props {
  films: Film[]
  onOpen: (film: Film) => void
  onRename: (from: string, to: string) => void
  onDelete: (tag: string) => void
  onClose: () => void
}

/** „Meine Listen“: alle eigenen Listen; antippen zeigt die Filme darin. */
export default function ListsView({ films, onOpen, onRename, onDelete, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState<string | null>(null)
  useSwipeBack(ref, () => (open ? setOpen(null) : onClose()))

  const lists = useMemo(() => {
    const map = new Map<string, Film[]>()
    for (const f of films) for (const t of f.tags ?? []) map.set(t, [...(map.get(t) ?? []), f])
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b, "de"))
  }, [films])

  const current = open ? lists.find(([t]) => t === open) : undefined
  // Liste gelöscht oder umbenannt → zurück zur Übersicht.
  if (open && !current) setOpen(null)

  function rename(tag: string) {
    const next = window.prompt("Neuer Name der Liste", tag)?.trim()
    if (!next || next === tag) return
    onRename(tag, next)
    setOpen(next)
  }

  function remove(tag: string, count: number) {
    if (!window.confirm(`Liste „${tag}“ löschen? Die ${count === 1 ? "Film bleibt" : `${count} Filme bleiben`} in deiner Sammlung.`)) return
    onDelete(tag)
    setOpen(null)
  }

  return (
    <div className="overlay stats detail-enter" role="dialog" aria-modal="true" aria-label="Meine Listen" ref={ref}>
      <header className="stats-head">
        <button type="button" className="round-btn" onClick={() => (current ? setOpen(null) : onClose())} aria-label="Zurück"><IconChevronLeft /></button>
        <h2 className="view-title">{current ? current[0] : "Meine Listen"}</h2>
      </header>

      {!current && (lists.length === 0 ? (
        <div className="empty">
          <p>Noch keine Listen. Auf der Detailseite eines Films kannst du ihn mit „+ Liste“ in eine eigene Liste legen.</p>
        </div>
      ) : (
        <ul className="group lists">
          {lists.map(([tag, list]) => (
            <li key={tag}>
              <button type="button" className="group-row row-button list-row" onClick={() => setOpen(tag)}>
                <span className="list-stack" aria-hidden="true">
                  {list.slice(0, 3).map((f) => <Poster key={f.tmdbId} path={f.posterPath} title={f.title} />)}
                </span>
                <span className="row-text">
                  {tag}
                  <span className="row-sub">{list.length === 1 ? "1 Film" : `${list.length} Filme`}</span>
                </span>
                <IconChevronRight className="row-chevron" />
              </button>
            </li>
          ))}
        </ul>
      ))}

      {current && (
        <>
          <div className="list-actions">
            <button type="button" className="btn btn-small" onClick={() => rename(current[0])}>Umbenennen</button>
            <button type="button" className="btn btn-small btn-danger" onClick={() => remove(current[0], current[1].length)}><IconTrash />Löschen</button>
          </div>
          <div className="grid">
            {current[1].map((f) => (
              <FilmCard key={f.tmdbId} title={f.title} year={f.year} posterPath={f.posterPath} rating={f.rating} onOpen={() => onOpen(f)} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
