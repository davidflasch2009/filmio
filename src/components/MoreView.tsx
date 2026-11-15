import { useRef, useState, type FormEvent } from "react"
import type { Store } from "../types"
import { exportJson, importJson, type ImportMode, type ImportResult } from "../lib/storage"
import tmdbLogo from "../assets/tmdb-logo.svg"

interface Props {
  store: Store
  onImported: (result: ImportResult) => void
}

type Message = { kind: "ok" | "error"; text: string }

export default function MoreView({ store, onImported }: Props) {
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
      <h1 id="more-heading" className="view-title">Mehr</h1>

      <section className="panel">
        <h2>Daten sichern</h2>
        <p className="hint">
          Deine Liste liegt nur in diesem Browser ({watched} gesehen, {watchlist} auf der Watchlist).
          Exportiere regelmäßig ein Backup.
        </p>
        <button type="button" className="btn btn-primary" onClick={onExport}>⬇ Export (JSON)</button>
      </section>

      <section className="panel">
        <h2>Import</h2>
        <form onSubmit={onImport} className="import-form">
          <label className="field">
            <span>Backup-Datei (.json)</span>
            <input
              ref={fileRef}
              type="file"
              accept=".json,application/json"
              onChange={(e) => { setFile(e.target.files?.[0] ?? null); setMessage(null) }}
            />
          </label>
          <fieldset className="radio-group">
            <legend>Vorhandene Daten</legend>
            <label>
              <input type="radio" name="import-mode" value="merge" checked={mode === "merge"} onChange={() => setMode("merge")} />
              Zusammenführen <span className="hint">(gleiche Filme werden überschrieben, neue ergänzt)</span>
            </label>
            <label>
              <input type="radio" name="import-mode" value="replace" checked={mode === "replace"} onChange={() => setMode("replace")} />
              Ersetzen <span className="hint">(komplette Liste durch das Backup ersetzen)</span>
            </label>
          </fieldset>
          <button type="submit" className="btn" disabled={!file || busy}>{busy ? "Importiere …" : "⬆ Importieren"}</button>
        </form>
      </section>

      {message && (
        <p className={`notice ${message.kind === "ok" ? "notice-ok" : "notice-error"}`} role={message.kind === "error" ? "alert" : "status"}>
          {message.text}
        </p>
      )}

      <section className="panel about">
        <h2>Über</h2>
        <p className="about-app"><span className="logo">filmio</span> – deine persönliche Filmliste.</p>
        <p className="hint">Alle Daten bleiben lokal auf deinem Gerät. Kein Konto, kein Server.</p>
        <div className="attribution">
          <img src={tmdbLogo} alt="TMDB – The Movie Database" className="tmdb-logo" width={40} height={40} />
          <p>This product uses the TMDB API but is not endorsed or certified by TMDB.</p>
        </div>
      </section>
    </section>
  )
}
