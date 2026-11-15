/** 4.5 → "4,5" */
export function formatRating(rating: number): string {
  return rating.toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 })
}

/** 142 → "2 Std. 22 Min." */
export function formatRuntime(minutes: number | null): string | null {
  if (!minutes || minutes <= 0) return null
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m} Min.`
  return m === 0 ? `${h} Std.` : `${h} Std. ${m} Min.`
}

/** ISO-Datum → "15.11.2026" */
export function formatDate(iso: string | null): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" })
}

/** Lokales Datum als YYYY-MM-DD (für Dateinamen). */
export function localDateStamp(d: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** Für die Suche in der eigenen Liste: klein, ohne Akzente. */
export function normalizeText(s: string): string {
  return s.toLocaleLowerCase("de-DE").normalize("NFD").replace(/[̀-ͯ]/g, "")
}
