import { useEffect, useMemo, useRef, useState } from "react"
import type { MyCinema } from "../types"
import { loadCinemas, type CpxCinema } from "../lib/cineplexx"
import { useOnline } from "../hooks/useOnline"
import { useSwipeBack } from "../hooks/useSwipeBack"
import SearchField from "./SearchField"
import { IconCheck, IconChevronLeft } from "./Icons"

interface Props {
  selected: MyCinema | null
  onChange: (cinema: MyCinema | null) => void
  onClose: () => void
}

/** „Mein Kino“: ein Cineplexx-Kino in Österreich – dann zeigt die Detailseite dessen Spielzeiten und Preise. */
export default function CinemaPicker({ selected, onChange, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  useSwipeBack(ref, onClose)
  const online = useOnline()
  const [cinemas, setCinemas] = useState<CpxCinema[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [query, setQuery] = useState("")

  useEffect(() => {
    if (!online) return
    let cancelled = false
    loadCinemas().then((c) => { if (!cancelled) { setCinemas(c); setFailed(false) } }, () => { if (!cancelled) setFailed(true) })
    return () => { cancelled = true }
  }, [online])

  const rows = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("de")
    return (cinemas ?? []).filter((c) => !q || `${c.name} ${c.place}`.toLocaleLowerCase("de").includes(q))
  }, [cinemas, query])

  function pick(c: CpxCinema | null) {
    onChange(c ? { id: c.id, name: c.name } : null)
    onClose()
  }

  return (
    <div className="overlay stats detail-enter" role="dialog" aria-modal="true" aria-label="Mein Kino" ref={ref}>
      <header className="stats-head">
        <button type="button" className="round-btn" onClick={onClose} aria-label="Zurück"><IconChevronLeft /></button>
        <h2 className="view-title">Mein Kino</h2>
      </header>

      <div className="services-body">
        <SearchField value={query} onChange={setQuery} placeholder="Kino oder Ort suchen" ariaLabel="Kino suchen" />
        {!cinemas && !failed && online && <p className="hint services-hint">Lade Kinos …</p>}
        {(!online || failed) && (
          <p className="notice notice-offline">{online ? "Die Kinos konnten nicht geladen werden." : "Offline – zum Auswählen braucht es Internet."}</p>
        )}
        {cinemas && (
          <ul className="group services-list">
            {selected && !query && (
              <li>
                <button type="button" className="group-row row-button service-row" onClick={() => pick(null)}>
                  <span className="row-text">Kein Kino</span>
                </button>
              </li>
            )}
            {rows.map((c) => {
              const on = selected?.id === c.id
              return (
                <li key={c.id}>
                  <button type="button" className="group-row row-button service-row" aria-pressed={on} onClick={() => pick(c)}>
                    <span className="row-text">
                      {c.name}
                      {c.place && <span className="row-sub">{c.place}</span>}
                    </span>
                    <span className={`service-check${on ? " on" : ""}`} aria-hidden="true">{on && <IconCheck />}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
        {cinemas && query.trim() && rows.length === 0 && <p className="hint services-hint">Kein Kino gefunden.</p>}
        <p className="group-note">Cineplexx-Kinos in Österreich. Spielzeiten und Preise kommen direkt von Cineplexx.</p>
      </div>
    </div>
  )
}
