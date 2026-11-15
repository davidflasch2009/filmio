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

export interface Settings {
  gridSize: GridSize
}

const DEFAULTS: Settings = { gridSize: "m" }

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : null
    const gridSize = (parsed as Partial<Settings> | null)?.gridSize
    return { ...DEFAULTS, ...(GRID_SIZES.some((g) => g.id === gridSize) ? { gridSize } : {}) }
  } catch {
    return { ...DEFAULTS }
  }
}

export function saveSettings(settings: Settings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
  } catch {
    // Nicht speicherbar (z.B. privater Modus) – gilt dann nur bis zum Neuladen.
  }
}
