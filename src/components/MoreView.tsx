import { useMemo, useState, useSyncExternalStore } from "react"
import type { MyCinema, Service, Store } from "../types"
import type { ImportResult } from "../lib/storage"
import { GRID_SIZES, REGIONS, type Settings } from "../lib/settings"
import { appVersion } from "../lib/updates"
import { forceSync, getSyncState, subscribeSync, type SyncState } from "../lib/sync"
import { recapYears } from "../lib/recap"
import { smallImageUrl } from "../lib/tmdb"
import tmdbLogo from "../assets/tmdb-logo.svg"
import ViewHeader from "./ViewHeader"
import NotificationSettings from "./NotificationSettings"
import BackupView from "./BackupView"
import {
  IconChart, IconCheck, IconChevronRight, IconDownload, IconGrid, IconGlobe, IconInfo, IconList, IconLogout, IconSync, IconTicket, IconTv,
} from "./Icons"

interface Props {
  store: Store
  account: string
  onSignOut: () => void
  onImported: (result: ImportResult) => void
  settings: Settings
  onSettingsChange: (patch: Partial<Settings>) => void
  onOpenStats: () => void
  services: Service[]
  onOpenServices: () => void
  onOpenLists: () => void
  cinema: MyCinema | null
  onOpenCinema: () => void
}

function syncText(state: SyncState): string {
  if (state.status === "syncing") return "Wird abgeglichen …"
  if (state.status === "offline") return "Offline – wird später abgeglichen"
  if (state.status === "error") return state.error ?? "Abgleich fehlgeschlagen"
  if (!state.lastSync) return "Noch nicht abgeglichen"
  const min = Math.floor((Date.now() - state.lastSync) / 60_000)
  if (min < 1) return "Abgeglichen · gerade eben"
  if (min < 60) return `Abgeglichen · vor ${min} Min.`
  const time = new Date(state.lastSync).toLocaleString("de-DE", { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" })
  return `Abgeglichen · ${time}`
}

type Picker = null | "grid" | "region"

export default function MoreView({ store, account, onSignOut, onImported, settings, onSettingsChange, onOpenStats, services, onOpenServices, onOpenLists, cinema, onOpenCinema }: Props) {
  const { gridSize, region, questionHelp } = settings
  const sync = useSyncExternalStore(subscribeSync, getSyncState)
  const [picker, setPicker] = useState<Picker>(null)
  const [backupOpen, setBackupOpen] = useState(false)

  const stats = useMemo(() => {
    const watched = store.films.filter((f) => f.status === "watched")
    const minutes = watched.reduce((s, f) => s + (f.runtime ?? 0) * (1 + (f.rewatches?.length ?? 0)), 0)
    return { watched: watched.length, watchlist: store.films.length - watched.length, hours: Math.round(minutes / 60) }
  }, [store.films])
  const tagCount = new Set(store.films.flatMap((f) => f.tags ?? [])).size
  const year = recapYears(store.films)[0]
  const gridLabel = GRID_SIZES.find((g) => g.id === gridSize)?.label ?? ""
  const regionLabel = REGIONS.find((r) => r.id === region)?.label ?? region
  const initial = (account.trim()[0] ?? "?").toUpperCase()

  return (
    <section className="view more" aria-labelledby="more-heading">
      <ViewHeader id="more-heading" title="Mehr" />

      {/* Profil */}
      <div className="profile">
        <div className="profile-top">
          <span className="profile-avatar" aria-hidden="true">{initial}</span>
          <div className="profile-name">
            <strong>{account || "Dein Account"}</strong>
            <span className={`profile-sync sync-${sync.status}`} role="status">{syncText(sync)}</span>
          </div>
        </div>
        <button type="button" className="profile-stats" onClick={onOpenStats} aria-label="Statistik öffnen">
          <span><strong>{stats.watched.toLocaleString("de-DE")}</strong>Gesehen</span>
          <span><strong>{stats.watchlist.toLocaleString("de-DE")}</strong>Watchlist</span>
          <span><strong>{stats.hours.toLocaleString("de-DE")}</strong>Stunden</span>
        </button>
      </div>

      <h2 className="group-label">Persönliches</h2>
      <div className="group">
        <button type="button" className="group-row row-button" onClick={onOpenStats}>
          <IconChart className="row-ic" />
          <span className="row-text">Statistik{year && <span className="row-sub">mit Jahresrückblick {year}</span>}</span>
          <IconChevronRight className="row-chevron" />
        </button>
        <button type="button" className="group-row row-button" onClick={onOpenLists}>
          <IconList className="row-ic" />
          <span className="row-text">Meine Listen</span>
          <span className="row-value">{tagCount || ""}</span>
          <IconChevronRight className="row-chevron" />
        </button>
        <button type="button" className="group-row row-button" onClick={onOpenCinema}>
          <IconTicket className="row-ic" />
          <span className="row-text">Mein Kino</span>
          <span className="row-value">{cinema ? cinema.name : "Keins"}</span>
          <IconChevronRight className="row-chevron" />
        </button>
        <button type="button" className="group-row row-button" onClick={onOpenServices}>
          <IconTv className="row-ic" />
          <span className="row-text">Meine Streaming-Dienste</span>
          {services.some((s) => s.logoPath) ? (
            <span className="services-summary" aria-label={services.map((s) => s.name).join(", ")}>
              {services.filter((s) => s.logoPath).slice(0, 3).map((s) => <img key={s.id} src={smallImageUrl(s.logoPath, "w92")!} alt="" />)}
            </span>
          ) : <span className="row-value">{services.length ? services.map((s) => s.name).join(", ") : "Keine"}</span>}
          <IconChevronRight className="row-chevron" />
        </button>
      </div>

      <h2 className="group-label">Einstellungen</h2>
      <NotificationSettings region={region} hasServices={services.length > 0} onOpenServices={onOpenServices} />
      <div className="group">
        <button type="button" className="group-row row-button" onClick={() => setPicker("grid")}>
          <IconGrid className="row-ic" />
          <span className="row-text">Kartengröße</span>
          <span className="row-value">{gridLabel}</span>
          <IconChevronRight className="row-chevron" />
        </button>
        <button type="button" className="group-row row-button" onClick={() => setPicker("region")}>
          <IconGlobe className="row-ic" />
          <span className="row-text">Land<span className="row-sub">für Streaming-Anbieter und Kinostarts</span></span>
          <span className="row-value">{regionLabel}</span>
          <IconChevronRight className="row-chevron" />
        </button>
        <div className="group-row switch-row">
          <IconInfo className="row-ic" />
          <span className="row-text" id="help-label">Erklärungen im Fragebogen<span className="row-sub">Das „i“ unter jeder Frage</span></span>
          <button
            type="button"
            role="switch"
            aria-checked={questionHelp}
            aria-labelledby="help-label"
            className={`switch${questionHelp ? " switch-on" : ""}`}
            onClick={() => onSettingsChange({ questionHelp: !questionHelp })}
          >
            <span className="switch-knob" />
          </button>
        </div>
      </div>

      <h2 className="group-label">Daten & Konto</h2>
      <div className="group">
        <button type="button" className="group-row row-button" onClick={() => setBackupOpen(true)}>
          <IconDownload className="row-ic" />
          <span className="row-text">Backup & Import</span>
          <IconChevronRight className="row-chevron" />
        </button>
        <button type="button" className="group-row row-button" onClick={() => void forceSync()} disabled={sync.status === "syncing"}>
          <IconSync className="row-ic" />
          <span className="row-text">Jetzt abgleichen</span>
        </button>
        <button type="button" className="group-row row-button row-danger" onClick={onSignOut}>
          <IconLogout className="row-ic" />
          <span className="row-text">Abmelden</span>
        </button>
      </div>

      <div className="about">
        <p className="about-app"><span className="logo">filmio</span> · Version {appVersion()}</p>
        <div className="attribution">
          <img src={tmdbLogo} alt="TMDB – The Movie Database" className="tmdb-logo" width={28} height={28} />
          <p>This product uses the TMDB API but is not endorsed or certified by TMDB.</p>
        </div>
      </div>

      {picker && (
        <div className="sheet-backdrop" onClick={(e) => { if (e.target === e.currentTarget) setPicker(null) }}>
          <div className="sheet" role="dialog" aria-label={picker === "grid" ? "Kartengröße" : "Land"}>
            <div className="sheet-grip" aria-hidden="true" />
            <p className="sheet-title">{picker === "grid" ? "Kartengröße" : "Land für Streaming-Anbieter und Kinostarts"}</p>
            <div className="sheet-group">
              {(picker === "grid" ? GRID_SIZES.map((g) => ({ id: g.id, label: g.label, sub: g.hint })) : REGIONS.map((r) => ({ id: r.id, label: r.label, sub: "" }))).map((o) => {
                const on = picker === "grid" ? o.id === gridSize : o.id === region
                return (
                  <button
                    key={o.id}
                    type="button"
                    className="sheet-row"
                    role="menuitemradio"
                    aria-checked={on}
                    onClick={() => { onSettingsChange(picker === "grid" ? { gridSize: o.id as Settings["gridSize"] } : { region: o.id as Settings["region"] }); setPicker(null) }}
                  >
                    <span>{o.label}{o.sub && <span className="row-sub"> · {o.sub}</span>}</span>
                    {on && <IconCheck />}
                  </button>
                )
              })}
            </div>
            <button type="button" className="sheet-cancel" onClick={() => setPicker(null)}>Abbrechen</button>
          </div>
        </div>
      )}

      {backupOpen && <BackupView store={store} onImported={onImported} onClose={() => setBackupOpen(false)} />}
    </section>
  )
}
