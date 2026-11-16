/**
 * Darstellungs-Einstellungen. Gehören zum Gerät, nicht zur Filmliste –
 * deshalb eigener Schlüssel und nicht Teil von Export/Import.
 */
export const SETTINGS_KEY = "filmio.settings"

export type GridSize = "s" | "m" | "l"

export const GRID_SIZES: { id: GridSize; label: string; hint: string }[] = [
  { id: "s", label: "Klein", hint: "4 pro Reihe" },
  { id: "m", label: "Mittel", hint: "3 pro Reihe" },
  { id: "l", label: "Groß", hint: "2 pro Reihe" },
]

/** Land für Streaming-Anbieter und Kinostarts. */
export type Region = "DE" | "AT" | "CH"

export const REGIONS: { id: Region; label: string }[] = [
  { id: "DE", label: "Deutschland" },
  { id: "AT", label: "Österreich" },
  { id: "CH", label: "Schweiz" },
]

export interface Settings {
  gridSize: GridSize
  region: Region
}

/** Land aus der Spracheinstellung des Geräts (de-AT → Österreich …), sonst Deutschland. */
function defaultRegion(): Region {
  const langs = typeof navigator === "undefined" ? [] : [...(navigator.languages ?? []), navigator.language ?? ""]
  for (const l of langs) {
    const m = /-(DE|AT|CH)$/i.exec(l)
    if (m) return m[1].toUpperCase() as Region
  }
  return "DE"
}

export function loadSettings(): Settings {
  const defaults: Settings = { gridSize: "m", region: defaultRegion() }
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    const parsed = (raw ? JSON.parse(raw) : null) as Partial<Settings> | null
    return {
      gridSize: GRID_SIZES.some((g) => g.id === parsed?.gridSize) ? parsed!.gridSize! : defaults.gridSize,
      region: REGIONS.some((r) => r.id === parsed?.region) ? parsed!.region! : defaults.region,
    }
  } catch {
    return defaults
  }
}

export function saveSettings(settings: Settings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
  } catch {
    // Nicht speicherbar (z.B. privater Modus) – gilt dann nur bis zum Neuladen.
  }
}
