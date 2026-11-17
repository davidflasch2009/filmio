// Bei welchen Anbietern laufen die Watchlist-Filme im Abo? Pro Film einmal am Tag bei TMDB nachgefragt,
// dazwischen (und offline) aus dem Gerätespeicher.
import type { RegionCode, Service } from "../types"
import { fetchStreamIds } from "./tmdb"

const KEY = "filmio.streams"
const MAX_AGE = 24 * 3600 * 1000

interface Entry { at: number; r: Record<RegionCode, number[]> }
type Cache = Record<string, Entry>

function read(): Cache {
  try {
    const c = JSON.parse(localStorage.getItem(KEY) || "{}") as unknown
    return c && typeof c === "object" && !Array.isArray(c) ? (c as Cache) : {}
  } catch {
    return {}
  }
}

function write(cache: Cache) {
  try {
    localStorage.setItem(KEY, JSON.stringify(cache))
  } catch {
    // Nur ein Cache – notfalls wird neu gefragt.
  }
}

/** Gecachte Anbieter-IDs (auch veraltete – besser als nichts). */
export function cachedStreams(ids: number[]): Map<number, Record<RegionCode, number[]>> {
  const cache = read()
  const out = new Map<number, Record<RegionCode, number[]>>()
  for (const id of ids) if (cache[id]) out.set(id, cache[id].r)
  return out
}

/** Filme, deren Angaben fehlen oder älter als ein Tag sind. */
export function staleStreams(ids: number[], now: number = Date.now()): number[] {
  const cache = read()
  return ids.filter((id) => !cache[id] || now - cache[id].at > MAX_AGE)
}

/** Holt die Anbieter für die Filme (3 parallel) und meldet jeden Treffer. */
export async function refreshStreams(ids: number[], onEach: (id: number, r: Record<RegionCode, number[]>) => void, isCancelled: () => boolean) {
  const queue = [...ids]
  const worker = async () => {
    while (queue.length && !isCancelled()) {
      const id = queue.shift()!
      try {
        const r = await fetchStreamIds(id)
        const cache = read()
        cache[id] = { at: Date.now(), r }
        write(cache)
        if (!isCancelled()) onEach(id, r)
      } catch {
        // Netzfehler: nächstes Mal wieder.
      }
    }
  }
  await Promise.all([worker(), worker(), worker()])
}

/** Meine Dienste, bei denen der Film läuft (in der Reihenfolge meiner Auswahl). */
export function matchServices(streamIds: number[] | undefined, services: Service[]): Service[] {
  if (!streamIds?.length) return []
  const set = new Set(streamIds)
  return services.filter((s) => s.ids.some((id) => set.has(id)))
}
