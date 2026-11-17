// Abgleich der Liste zwischen den Geräten.
// Jedes Gerät hat die komplette Liste lokal (offline nutzbar). Beim Abgleich wird die Liste vom Server
// mit der lokalen zusammengeführt – pro Film gewinnt die jüngere Änderung, Löschungen werden über
// Lösch-Marker weitergegeben – und das Ergebnis wieder hochgeladen.

import type { Film, Store } from "../types"
import { changedAt, load, onLocalChange, parseStore, save } from "./storage"
import { CloudError, loadSession, pullRemote, pushRemote } from "./cloud"

// ---------------------------------------------------------------------------
// Zusammenführen
// ---------------------------------------------------------------------------

/** Führt zwei Stände zusammen. Bei gleichem Stand gewinnt `local`; nachgeladene Szenenbilder werden ergänzt. */
export function mergeStores(local: Store, remote: Store): Store {
  const deleted: Record<string, string> = { ...remote.deleted }
  for (const [id, at] of Object.entries(local.deleted ?? {})) {
    if (!deleted[id] || at > deleted[id]) deleted[id] = at
  }

  const remoteById = new Map(remote.films.map((f) => [f.tmdbId, f]))
  const pick = (a: Film, b: Film | undefined): Film => {
    if (!b) return a
    const winner = changedAt(b) > changedAt(a) ? b : a
    const other = winner === a ? b : a
    // Automatisch nachgeladene Felder (zählen nicht als Änderung) vom anderen Stand ergänzen.
    let out = winner
    if (out.backdropPath === undefined && other.backdropPath !== undefined) out = { ...out, backdropPath: other.backdropPath }
    if (other.release && (!out.release || other.release.checkedAt > out.release.checkedAt)) out = { ...out, release: other.release }
    return out
  }

  // Reihenfolge der lokalen Liste beibehalten, neue Filme vom Server hinten anhängen.
  const films: Film[] = []
  for (const f of local.films) {
    films.push(pick(f, remoteById.get(f.tmdbId)))
    remoteById.delete(f.tmdbId)
  }
  films.push(...remoteById.values())

  // Gelöscht ist ein Film, wenn er nach seiner letzten Änderung gelöscht wurde.
  const alive = films.filter((f) => {
    const at = deleted[f.tmdbId]
    return !at || changedAt(f) > at
  })
  for (const f of alive) delete deleted[f.tmdbId]

  const merged: Store = { version: 1, films: alive }
  if (Object.keys(deleted).length) merged.deleted = deleted
  const services = !local.services ? remote.services : !remote.services ? local.services
    : remote.services.updatedAt > local.services.updatedAt ? remote.services : local.services
  if (services) merged.services = services
  return merged
}

/** Vergleichbare Form (Reihenfolge der Filme spielt für den Inhalt keine Rolle). */
function fingerprint(store: Store): string {
  const films = [...store.films].sort((a, b) => a.tmdbId - b.tmdbId)
  const deleted = Object.entries(store.deleted ?? {}).sort(([a], [b]) => Number(a) - Number(b))
  return JSON.stringify([films, deleted, store.services ?? null])
}

// ---------------------------------------------------------------------------
// Zustand für die Oberfläche
// ---------------------------------------------------------------------------

export type SyncStatus = "idle" | "syncing" | "offline" | "error"

export interface SyncState {
  status: SyncStatus
  /** Letzter erfolgreicher Abgleich (ms). */
  lastSync: number | null
  error: string | null
}

const LAST_SYNC_KEY = "filmio.lastSync"

function readLastSync(): number | null {
  try {
    const v = Number(localStorage.getItem(LAST_SYNC_KEY))
    return v > 0 ? v : null
  } catch {
    return null
  }
}

let state: SyncState = { status: "idle", lastSync: readLastSync(), error: null }
const stateListeners = new Set<() => void>()

function setState(patch: Partial<SyncState>) {
  state = { ...state, ...patch }
  stateListeners.forEach((fn) => fn())
}

export function getSyncState(): SyncState {
  return state
}

export function subscribeSync(fn: () => void): () => void {
  stateListeners.add(fn)
  return () => { stateListeners.delete(fn) }
}

// ---------------------------------------------------------------------------
// Abgleich
// ---------------------------------------------------------------------------

/**
 * Ein Abgleich: Server-Stand holen, zusammenführen, lokal speichern, hochladen.
 * Hat ein anderes Gerät dazwischen gespeichert, wird mit dessen Stand neu zusammengeführt.
 * Gibt den neuen lokalen Store zurück, falls er sich geändert hat.
 */
async function syncOnce(): Promise<Store | null> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const remote = await pullRemote()
    const remoteStore = (remote && parseStore(remote.data)) ?? { version: 1 as const, films: [] }
    const local = load()
    const merged = mergeStores(local, remoteStore)
    const mergedPrint = fingerprint(merged)

    const localChanged = mergedPrint !== fingerprint(local)
    if (localChanged) save(merged, { silent: true })

    if (remote && mergedPrint === fingerprint(remoteStore)) return localChanged ? merged : null
    const rev = await pushRemote(merged, remote?.rev ?? 0)
    if (rev !== null) return localChanged ? merged : null
    // Konflikt: anderes Gerät war schneller → nochmal mit dessen Stand.
  }
  throw new CloudError("Der Abgleich ist mehrmals kollidiert. Bitte später noch einmal versuchen.", "server")
}

let running: Promise<void> | null = null
let again = false
let onRemoteChange: ((store: Store) => void) | null = null
let onSignedOut: (() => void) | null = null

/** Abgleich jetzt starten (läuft schon einer, folgt direkt danach ein weiterer). */
export function syncNow(): Promise<void> {
  if (!loadSession()) return Promise.resolve()
  if (running) {
    again = true
    return running
  }
  running = (async () => {
    do {
      again = false
      setState({ status: "syncing" })
      try {
        const changed = await syncOnce()
        if (changed) onRemoteChange?.(changed)
        const now = Date.now()
        try { localStorage.setItem(LAST_SYNC_KEY, String(now)) } catch { /* egal */ }
        setState({ status: "idle", lastSync: now, error: null })
      } catch (e) {
        const err = e instanceof CloudError ? e : new CloudError("Abgleich fehlgeschlagen.", "server")
        if (err.kind === "offline") setState({ status: "offline", error: null })
        else setState({ status: "error", error: err.message })
        if (err.kind === "auth" && !loadSession()) onSignedOut?.()
        again = false
      }
    } while (again)
  })().finally(() => { running = null })
  return running
}

let debounce: ReturnType<typeof setTimeout> | undefined

/** Startet den automatischen Abgleich. Gibt eine Aufräum-Funktion zurück. */
export function startSync(handlers: { onRemoteChange: (store: Store) => void; onSignedOut: () => void }): () => void {
  onRemoteChange = handlers.onRemoteChange
  onSignedOut = handlers.onSignedOut

  // Eigene Änderung → kurz sammeln, dann hochladen.
  const offChange = onLocalChange(() => {
    clearTimeout(debounce)
    debounce = setTimeout(() => void syncNow(), 800)
  })
  const onVisible = () => { if (document.visibilityState === "visible") void syncNow() }
  const onOnline = () => void syncNow()
  document.addEventListener("visibilitychange", onVisible)
  window.addEventListener("online", onOnline)
  // Solange die App offen ist, regelmäßig nach Änderungen von anderen Geräten schauen.
  const interval = setInterval(() => { if (document.visibilityState === "visible") void syncNow() }, 60_000)

  void syncNow()

  return () => {
    offChange()
    clearTimeout(debounce)
    clearInterval(interval)
    document.removeEventListener("visibilitychange", onVisible)
    window.removeEventListener("online", onOnline)
    onRemoteChange = null
    onSignedOut = null
  }
}

/** Beim Abmelden: Zeitpunkt des letzten Abgleichs vergessen. */
export function resetSyncState() {
  try { localStorage.removeItem(LAST_SYNC_KEY) } catch { /* egal */ }
  setState({ status: "idle", lastSync: null, error: null })
}
