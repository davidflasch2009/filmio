import { useEffect, useState } from "react"
import type { Film } from "../types"
import { fetchCollectionId, hasToken, loadCollection } from "../lib/tmdb"
import { loadSeries, saveSeries, seriesFromCollection, seriesNeedsRefresh, type SeriesCache } from "../lib/series"

/**
 * Filmreihen der Watchlist-Filme im Hintergrund nachschlagen (für den Würfel) und auf dem Gerät merken.
 * Ohne Internet bleibt es beim Bekannten – unbekannte Filme würfelt der Würfel dann einfach normal mit.
 */
export function useSeries(films: Film[], online: boolean): SeriesCache {
  const [cache, setCache] = useState<SeriesCache>(loadSeries)

  const watchlistIds = films.filter((f) => f.status === "watchlist").map((f) => f.tmdbId)
  const unknown = watchlistIds.filter((id) => !(String(id) in cache.films))
  const stale = [...new Set(watchlistIds.map((id) => cache.films[id]).filter((c): c is number => c != null))]
    .filter((c) => seriesNeedsRefresh(cache.collections[c]))
  const todo = unknown.length + stale.length

  useEffect(() => {
    if (!online || !hasToken || todo === 0) return
    let cancelled = false
    const current = loadSeries()
    const save = () => { if (!cancelled) { saveSeries(current); setCache({ ...current, films: { ...current.films }, collections: { ...current.collections } }) } }
    const filmQueue = [...unknown]
    const colQueue = new Set(stale)

    const filmWorker = async () => {
      while (filmQueue.length && !cancelled) {
        const id = filmQueue.shift()!
        try {
          const col = await fetchCollectionId(id)
          current.films[id] = col
          if (col !== null && seriesNeedsRefresh(current.collections[col])) colQueue.add(col)
        } catch {
          // Netzfehler: beim nächsten Mal erneut.
        }
      }
    }
    void (async () => {
      await Promise.all([filmWorker(), filmWorker(), filmWorker()])
      for (const col of colQueue) {
        if (cancelled) return
        try {
          current.collections[col] = seriesFromCollection(await loadCollection(col))
        } catch {
          // Netzfehler: beim nächsten Mal erneut.
        }
      }
      save()
    })()
    return () => { cancelled = true }
    // Nur neu starten, wenn sich die Menge des Unbekannten ändert.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online, todo])

  return cache
}
