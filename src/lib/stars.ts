/** Abstand zwischen zwei Sternen relativ zur Sterngröße (muss zu .stars im CSS passen: gap 0.2em). */
const GAP = 0.2

/** Anteil der Gesamtbreite, den die gefüllte Sternreihe bei dieser Bewertung braucht (halbe Sterne exakt). */
export function starFillPercent(value: number): number {
  const v = Math.min(5, Math.max(0, value))
  const full = Math.floor(v)
  const filled = full * (1 + GAP) + (v - full)
  return Math.min(100, (filled / (5 + 4 * GAP)) * 100)
}
