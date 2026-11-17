import { useEffect, useMemo, useState } from "react"
import type { Film, RegionCode, Service } from "../types"
import { cachedStreams, matchServices, refreshStreams, staleStreams } from "../lib/streams"
import { hasToken } from "../lib/tmdb"

/**
 * Für jeden Watchlist-Film: bei welchen meiner Dienste läuft er gerade?
 * Nur aktiv, wenn Dienste gewählt sind. Liefert tmdbId → passende Dienste (leer = bei keinem).
 */
export function useStreams(films: Film[], services: Service[], region: RegionCode, online: boolean): Map<number, Service[]> {
  const idsKey = useMemo(() => films.filter((f) => f.status === "watchlist").map((f) => f.tmdbId).join(","), [films])
  const active = services.length > 0
  /** Zählt hoch, sobald neue Angaben im Cache liegen. */
  const [version, setVersion] = useState(0)

  useEffect(() => {
    if (!active || !online || !hasToken || !idsKey) return
    let cancelled = false
    const ids = idsKey.split(",").map(Number)
    void refreshStreams(staleStreams(ids), () => setVersion((v) => v + 1), () => cancelled)
    return () => { cancelled = true }
  }, [idsKey, active, online])

  return useMemo(() => {
    const out = new Map<number, Service[]>()
    if (!active || !idsKey) return out
    const ids = idsKey.split(",").map(Number)
    const raw = cachedStreams(ids)
    for (const id of ids) out.set(id, matchServices(raw.get(id)?.[region], services))
    return out
    // version: neu aus dem Cache lesen, wenn frische Angaben da sind.
  }, [idsKey, region, services, active, version]) // eslint-disable-line react-hooks/exhaustive-deps
}
