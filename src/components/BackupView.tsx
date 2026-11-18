import { useRef, useState, type FormEvent } from "react"
import type { Store } from "../types"
import { exportJson, importJson, type ImportMode, type ImportResult } from "../lib/storage"
import { useSwipeBack } from "../hooks/useSwipeBack"
import { IconCheck, IconChevronLeft, IconChevronRight, IconDownload, IconUpload } from "./Icons"

interface Props {
  store: Store
  onImported: (result: ImportResult) => void
  onClose: () => void
}

type Message = { kind: "ok" | "error"; text: string }

/** Unterseite „Backup & Import“: Liste als Datei sichern oder eine Sicherung einspielen. */
export default function BackupView({ store, onImported, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  useSwipeBack(ref, onClose)
  const fileRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [mode, setMode] = useState<ImportMode>("merge")
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<Message | null>(null)
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
    <div className="overlay stats detail-enter" role="dialog" aria-modal="true" aria-label="Backup & Import" ref={ref}>
      <header className="stats-head">
        <button type="button" className="round-btn" onClick={onClose} aria-label="Zurück"><IconChevronLeft /></button>
        <h2 className="view-title">Backup & Import</h2>
      </header>

      <div className="group">
        <button type="button" className="group-row row-button" onClick={onExport}>
          <IconDownload className="row-ic" />
          <span className="row-text">Backup exportieren<span className="row-sub">{store.films.length} Filme als Datei sichern</span></span>
          <IconChevronRight className="row-chevron" />
        </button>
      </div>

      <h2 className="group-label">Backup einspielen</h2>
      <form onSubmit={onImport} className="group import-form">
        <label className="group-row row-button">
          <IconUpload className="row-ic" />
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

    </div>
  )
}
