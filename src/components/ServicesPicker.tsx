import { useEffect, useMemo, useRef, useState } from "react"
import type { RegionCode, Service } from "../types"
import { hasToken, loadServiceCatalog, smallImageUrl } from "../lib/tmdb"
import { REGIONS } from "../lib/settings"
import { useOnline } from "../hooks/useOnline"
import { useSwipeBack } from "../hooks/useSwipeBack"
import SearchField from "./SearchField"
import { IconCheck, IconChevronLeft } from "./Icons"

interface Props {
  selected: Service[]
  region: RegionCode
  onChange: (list: Service[]) => void
  onClose: () => void
}

/** Wie viele Dienste ohne Suche gezeigt werden (die beliebtesten). */
const TOP = 30

function Logo({ service }: { service: Service }) {
  const [failed, setFailed] = useState(false)
  if (!service.logoPath || failed) return <span className="service-logo service-logo-empty" aria-hidden="true">{service.name.slice(0, 1)}</span>
  return <img className="service-logo" src={smallImageUrl(service.logoPath, "w92")!} alt="" loading="lazy" onError={() => setFailed(true)} />
}

/** „Meine Streaming-Dienste“: Abos auswählen – Watchlist und Würfel zeigen dann, was davon läuft. */
export default function ServicesPicker({ selected, region, onChange, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  useSwipeBack(ref, onClose)
  const online = useOnline()
  const [catalog, setCatalog] = useState<Service[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [query, setQuery] = useState("")

  useEffect(() => {
    if (!hasToken || !online) return
    let cancelled = false
    loadServiceCatalog(region).then(
      (c) => { if (!cancelled) { setCatalog(c); setFailed(false) } },
      () => { if (!cancelled) setFailed(true) },
    )
    return () => { cancelled = true }
  }, [region, online])

  const selectedIds = new Set(selected.map((s) => s.id))
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    const rest = (catalog ?? []).filter((s) => !selected.some((x) => x.id === s.id))
    const matches = q ? rest.filter((s) => s.name.toLowerCase().includes(q)) : rest.slice(0, TOP)
    const mine = q ? selected.filter((s) => s.name.toLowerCase().includes(q)) : selected
    return [...mine, ...matches]
  }, [catalog, selected, query])

  function toggle(service: Service) {
    onChange(selectedIds.has(service.id) ? selected.filter((s) => s.id !== service.id) : [...selected, service])
  }

  const regionLabel = REGIONS.find((r) => r.id === region)?.label ?? region

  return (
    <div className="overlay stats detail-enter" role="dialog" aria-modal="true" aria-label="Meine Streaming-Dienste" ref={ref}>
      <header className="stats-head">
        <button type="button" className="round-btn" onClick={onClose} aria-label="Zurück"><IconChevronLeft /></button>
        <h2 className="view-title">Meine Dienste</h2>
      </header>

      <div className="services-body">
        <SearchField value={query} onChange={setQuery} placeholder="Dienst suchen" ariaLabel="Streaming-Dienst suchen" />

        {!catalog && !failed && online && hasToken && <p className="hint services-hint">Lade Dienste in {regionLabel} …</p>}
        {(!online || failed || !hasToken) && (
          <p className="notice notice-offline">{online && hasToken ? "Die Dienste konnten nicht geladen werden." : "Offline – zum Auswählen braucht es Internet."}</p>
        )}

        {rows.length > 0 && (
          <ul className="group services-list">
            {rows.map((s) => {
              const on = selectedIds.has(s.id)
              return (
                <li key={s.id}>
                  <button type="button" className="group-row row-button service-row" aria-pressed={on} onClick={() => toggle(s)}>
                    <Logo service={s} />
                    <span className="row-text">{s.name}</span>
                    <span className={`service-check${on ? " on" : ""}`} aria-hidden="true">{on && <IconCheck />}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
        {catalog && query.trim() && rows.length === 0 && <p className="hint services-hint">Kein Dienst gefunden.</p>}
      </div>
    </div>
  )
}
