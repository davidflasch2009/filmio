import { useEffect, useMemo, useState } from "react"
import type { MyCinema } from "../types"
import { formatEuro, loadPrices, loadProgramme, loadSessions, matchMovie, movieUrl, type CpxMovie, type CpxSession, type PriceArea } from "../lib/cineplexx"
import { useOnline } from "../hooks/useOnline"

interface Props {
  cinema: MyCinema
  film: { title: string; year: number | null; originalTitle?: string }
}

const WEEKDAYS = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"]

/** Tag als YYYY-MM-DD in österreichischer Zeit (die Spielzeiten sind dort). */
function dayKey(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Vienna", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso))
}
function timeOf(iso: string): string {
  return new Intl.DateTimeFormat("de-AT", { timeZone: "Europe/Vienna", hour: "2-digit", minute: "2-digit" }).format(new Date(iso))
}
function dayLabel(day: string, today: string, tomorrow: string): string {
  if (day === today) return "Heute"
  if (day === tomorrow) return "Morgen"
  const d = new Date(`${day}T12:00:00`)
  return `${WEEKDAYS[d.getDay()]} ${d.getDate()}.${d.getMonth() + 1}.`
}

/** „Im Kino“: Spielzeiten des Films in meinem Kino; Antippen zeigt Saal, Preise und den Weg zu den Tickets. */
export default function CinemaSessions({ cinema, film }: Props) {
  const online = useOnline()
  const [movie, setMovie] = useState<CpxMovie | null>(null)
  const [sessions, setSessions] = useState<CpxSession[] | null>(null)
  const [day, setDay] = useState<string | null>(null)
  const [open, setOpen] = useState<CpxSession | null>(null)
  const [prices, setPrices] = useState<{ id: string; areas: PriceArea[] | null; failed?: boolean } | null>(null)

  const key = `${cinema.id}|${film.title}|${film.year}|${film.originalTitle ?? ""}`
  useEffect(() => {
    if (!online) return
    let cancelled = false
    void (async () => {
      try {
        const m = matchMovie(await loadProgramme(), film, cinema.id)
        if (cancelled) return
        setMovie(m)
        setSessions(m ? await loadSessions(m.id, cinema.id) : [])
      } catch {
        if (!cancelled) setSessions([])
      }
    })()
    return () => { cancelled = true }
    // key fasst film + cinema zusammen
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, online])

  const days = useMemo(() => {
    const map = new Map<string, CpxSession[]>()
    for (const s of sessions ?? []) map.set(dayKey(s.showtime), [...(map.get(dayKey(s.showtime)) ?? []), s])
    return [...map.entries()]
  }, [sessions])

  function openSession(s: CpxSession) {
    if (open?.sessionId === s.sessionId) { setOpen(null); return }
    setOpen(s)
    setPrices({ id: s.sessionId, areas: null })
    loadPrices(s.cinemaId, s.sessionId).then(
      (areas) => setPrices((p) => (p?.id === s.sessionId ? { id: s.sessionId, areas } : p)),
      () => setPrices((p) => (p?.id === s.sessionId ? { id: s.sessionId, areas: null, failed: true } : p)),
    )
  }

  if (!movie || !sessions || days.length === 0) return null
  const today = dayKey(new Date().toISOString())
  const tomorrow = dayKey(new Date(Date.now() + 864e5).toISOString())
  const current = days.find(([d]) => d === day) ?? days[0]

  return (
    <section className="detail-section cinema-sessions" aria-label={`Spielzeiten im ${cinema.name}`}>
      <div className="section-head">
        <h3>Im Kino</h3>
        <span className="section-note">{cinema.name}</span>
      </div>
      <div className="cinema-days" role="tablist" aria-label="Tag">
        {days.map(([d]) => (
          <button
            key={d}
            type="button"
            role="tab"
            aria-selected={d === current[0]}
            className={`chip chip-toggle${d === current[0] ? " chip-active" : ""}`}
            onClick={() => { setDay(d); setOpen(null) }}
          >
            <span className="chip-text">{dayLabel(d, today, tomorrow)}</span>
          </button>
        ))}
      </div>
      <ul className="cinema-times">
        {current[1].map((s) => {
          const extra = s.tags.filter((t) => t !== "2D")
          return (
            <li key={s.sessionId}>
              <button
                type="button"
                className={`cinema-time${open?.sessionId === s.sessionId ? " open" : ""}`}
                aria-expanded={open?.sessionId === s.sessionId}
                onClick={() => openSession(s)}
              >
                <strong>{timeOf(s.showtime)}</strong>
                {extra.length > 0 && <span>{extra.join(" · ")}</span>}
              </button>
            </li>
          )
        })}
      </ul>
      {open && current[1].some((s) => s.sessionId === open.sessionId) && (
        <div className="cinema-panel">
          <p className="cinema-panel-head">
            {dayLabel(dayKey(open.showtime), today, tomorrow)} · {timeOf(open.showtime)} Uhr{open.screen ? ` · ${open.screen}` : ""}
            {open.tags.length > 0 && <span className="cinema-tags">{open.tags.join(" · ")}</span>}
          </p>
          {prices?.areas === null && !prices.failed && <p className="hint">Lade Preise …</p>}
          {prices?.failed && <p className="hint">Preise gerade nicht abrufbar.</p>}
          {prices?.areas && prices.areas.length > 0 && (
            <ul className="price-list">
              {prices.areas.map((a) => (
                <li key={a.name}>
                  <span className="price-area">{a.name}</span>
                  <span className="price-values">{a.prices.map((p) => `${p.label} ${formatEuro(p.cents)}`).join(" · ")}</span>
                </li>
              ))}
            </ul>
          )}
          <a className="btn btn-primary btn-block cinema-book" href={movieUrl(movie)} target="_blank" rel="noopener noreferrer">
            Tickets bei Cineplexx
          </a>
        </div>
      )}
      <p className="hint cinema-source">Spielzeiten und Preise laut Cineplexx</p>
    </section>
  )
}
