import { useRef, useState, type FormEvent } from "react"
import type { Store } from "../types"
import { exportJson, importJson, type ImportMode, type ImportResult } from "../lib/storage"
import { GRID_SIZES, type GridSize } from "../lib/settings"
import { appVersion } from "../lib/updates"
import tmdbLogo from "../assets/tmdb-logo.svg"
import ViewHeader from "./ViewHeader"
import { IconCheck, IconChevronRight, IconDownload, IconUpload } from "./Icons"

interface Props {
  store: Store
  onImported: (result: ImportResult) => void
  gridSize: GridSize
  onGridSizeChange: (size: GridSize) => void
}

type Message = { kind: "ok" | "error"; text: string }

export default function MoreView({ store, onImported, gridSize, onGridSizeChange }: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [mode, setMode] = useState<ImportMode>("merge")
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<Message | null>(null)

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
                  onChange={() => onGridSizeChange(g.id)}
                />
                <span className="segment-label">{g.label}</span>
                <span className="segment-hint">{g.hint}</span>
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
        Deine Liste liegt nur auf diesem Gerät ({watched} gesehen, {watchlist} auf der Watchlist).
        Exportiere regelmäßig ein Backup.
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
          <p className="hint">Alle Daten bleiben lokal auf deinem Gerät. Kein Konto, kein Server.</p>
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
