import { useRef, useState, useSyncExternalStore, type FormEvent } from "react"
import type { Store } from "../types"
import { exportJson, importJson, type ImportMode, type ImportResult } from "../lib/storage"
import { GRID_SIZES, REGIONS, type Settings } from "../lib/settings"
import { appVersion } from "../lib/updates"
import { getSyncState, subscribeSync, syncNow, type SyncState } from "../lib/sync"
import tmdbLogo from "../assets/tmdb-logo.svg"
import ViewHeader from "./ViewHeader"
import { IconChart, IconCheck, IconChevronRight, IconDownload, IconLogout, IconSync, IconUpload, IconUser } from "./Icons"

interface Props {
  store: Store
  account: string
  onSignOut: () => void
  onImported: (result: ImportResult) => void
  settings: Settings
  onSettingsChange: (patch: Partial<Settings>) => void
  onOpenStats: () => void
}

type Message = { kind: "ok" | "error"; text: string }

function syncText(state: SyncState): string {
  if (state.status === "syncing") return "Wird abgeglichen …"
  if (state.status === "offline") return "Offline – wird abgeglichen, sobald du wieder online bist"
  if (state.status === "error") return state.error ?? "Abgleich fehlgeschlagen"
  if (!state.lastSync) return "Noch nicht abgeglichen"
  const min = Math.floor((Date.now() - state.lastSync) / 60_000)
  if (min < 1) return "Abgeglichen · gerade eben"
  if (min < 60) return `Abgeglichen · vor ${min} Min.`
  const time = new Date(state.lastSync).toLocaleString("de-DE", { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" })
  return `Abgeglichen · ${time}`
}

export default function MoreView({ store, account, onSignOut, onImported, settings, onSettingsChange, onOpenStats }: Props) {
  const { gridSize, region } = settings
  const fileRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [mode, setMode] = useState<ImportMode>("merge")
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<Message | null>(null)
  const sync = useSyncExternalStore(subscribeSync, getSyncState)

  const watched = store.films.filter((f) => f.status === "watched").length
  const watchlist = store.films.length - watched

  function onExport() {
    try {
      exportJson()
      setMessage({ kind: "ok", text: `Backup mit ${store.films.length} Filmen wird heruntergeladen.` })
    } catch (e) {
      setMessage({ kind: "error", text: e instanceof Error ? e.message : "Export fehlgeschlagen." })
    }
  }

  async function onImport(e: FormEvent) {
    e.preventDefault()
    if (!file) return
    if (mode === "replace" && store.films.length > 0 &&
      !window.confirm(`Alle ${store.films.length} vorhandenen Filme werden durch das Backup ersetzt. Fortfahren?`)) {
      return
    }
    setBusy(true)
    setMessage(null)
    try {
      const result = await importJson(file, mode)
      onImported(result)
      setMessage({
        kind: "ok",
        text: result.mode === "replace"
          ? `Import fertig: Liste ersetzt, jetzt ${result.total} Filme.`
          : `Import fertig: ${result.added} neu, ${result.updated} aktualisiert – jetzt ${result.total} Filme.`,
      })
    } catch (err) {
      setMessage({
        kind: "error",
        text: `Import abgebrochen, nichts wurde geändert. ${err instanceof Error ? err.message : ""}`.trim(),
      })
    } finally {
      setBusy(false)
      // Auswahl immer zurücksetzen: Sonst feuert der Browser kein "change", wenn dieselbe
      // (z.B. korrigierte) Datei erneut gewählt wird, und das veraltete File-Objekt bleibt hängen.
      setFile(null)
      if (fileRef.current) fileRef.current.value = ""
    }
  }

  return (
    <section className="view" aria-labelledby="more-heading">
      <ViewHeader id="more-heading" title="Mehr" />

      <div className="group account">
        <div className="group-row account-row">
          <span className="row-icon"><IconUser /></span>
          <span className="row-text">
            {account || "Dein Account"}
            <span className={`row-sub sync-${sync.status}`} role="status">{syncText(sync)}</span>
          </span>
        </div>
        <button type="button" className="group-row row-button" onClick={() => void syncNow()} disabled={sync.status === "syncing"}>
          <span className="row-icon"><IconSync /></span>
          <span className="row-text">Jetzt abgleichen</span>
        </button>
        <button type="button" className="group-row row-button row-danger" onClick={onSignOut}>
          <span className="row-icon"><IconLogout /></span>
          <span className="row-text">Abmelden</span>
        </button>
      </div>

      <div className="group">
        <button type="button" className="group-row row-button" onClick={onOpenStats}>
          <span className="row-icon"><IconChart /></span>
          <span className="row-text">Statistik</span>
          <IconChevronRight className="row-chevron" />
        </button>
      </div>

      <h2 className="group-label">Darstellung</h2>
      <div className="group">
        <fieldset className="group-row segmented">
          <legend>Größe der Filmkarten</legend>
          <div className="segments">
            {GRID_SIZES.map((g) => (
              <label key={g.id} className={gridSize === g.id ? "segment segment-active" : "segment"}>
                <input
                  type="radio"
                  name="grid-size"
                  value={g.id}
                  checked={gridSize === g.id}
                  onChange={() => onSettingsChange({ gridSize: g.id })}
                />
                <span className="segment-label">{g.label}</span>
                <span className="segment-hint">{g.hint}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset className="group-row segmented">
          <legend>Land für Streaming-Anbieter</legend>
          <div className="segments">
            {REGIONS.map((r) => (
              <label key={r.id} className={region === r.id ? "segment segment-active" : "segment"}>
                <input type="radio" name="region" value={r.id} checked={region === r.id} onChange={() => onSettingsChange({ region: r.id })} />
                <span className="segment-label">{r.label}</span>
              </label>
            ))}
          </div>
        </fieldset>
      </div>

      <h2 className="group-label">Daten</h2>
      <div className="group">
        <button type="button" className="group-row row-button" onClick={onExport}>
          <span className="row-icon"><IconDownload /></span>
          <span className="row-text">Backup exportieren</span>
          <IconChevronRight className="row-chevron" />
        </button>
      </div>
      <p className="group-note">
        {watched} gesehen, {watchlist} auf der Watchlist – auf allen Geräten, auf denen du angemeldet bist.
      </p>

      <form onSubmit={onImport} className="group import-form">
        <label className="group-row row-button">
          <span className="row-icon"><IconUpload /></span>
          <span className="row-text">{file ? file.name : "Backup-Datei auswählen"}</span>
          <IconChevronRight className="row-chevron" />
          <input
            ref={fileRef}
            className="file-input"
            type="file"
            accept=".json,application/json"
            onChange={(e) => { setFile(e.target.files?.[0] ?? null); setMessage(null) }}
          />
        </label>
        <fieldset className="radio-group">
          <legend className="vh">Vorhandene Daten</legend>
          <label className="group-row radio-row">
            <input type="radio" name="import-mode" value="merge" checked={mode === "merge"} onChange={() => setMode("merge")} />
            <span className="row-text">
              Zusammenführen
              <span className="row-sub">Gleiche Filme werden überschrieben, neue ergänzt</span>
            </span>
            <IconCheck className="radio-check" />
          </label>
          <label className="group-row radio-row">
            <input type="radio" name="import-mode" value="replace" checked={mode === "replace"} onChange={() => setMode("replace")} />
            <span className="row-text">
              Ersetzen
              <span className="row-sub">Die komplette Liste wird durch das Backup ersetzt</span>
            </span>
            <IconCheck className="radio-check" />
          </label>
        </fieldset>
        <div className="group-row">
          <button type="submit" className="btn btn-primary btn-block" disabled={!file || busy}>{busy ? "Importiere …" : "Importieren"}</button>
        </div>
      </form>

      {message && (
        <p className={`notice ${message.kind === "ok" ? "notice-ok" : "notice-error"}`} role={message.kind === "error" ? "alert" : "status"}>
          {message.text}
        </p>
      )}

      <h2 className="group-label">Über</h2>
      <div className="group about">
        <div className="group-row">
          <p className="about-app"><span className="logo">filmio</span> – deine persönliche Filmliste.</p>
          <p className="hint">Deine Liste liegt auf deinen Geräten und in deinem eigenen Supabase-Projekt (Frankfurt).</p>
          <p className="hint app-version">Version {appVersion()}</p>
        </div>
        <div className="group-row attribution">
          <img src={tmdbLogo} alt="TMDB – The Movie Database" className="tmdb-logo" width={32} height={32} />
          <p>This product uses the TMDB API but is not endorsed or certified by TMDB.</p>
        </div>
      </div>
    </section>
  )
}
