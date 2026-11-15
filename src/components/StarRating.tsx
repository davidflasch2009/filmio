import { formatRating } from "../lib/format"

interface Props {
  value: number
  size?: "sm" | "md" | "lg"
  showValue?: boolean
}

/** Zeigt 0,5–5 Sterne inkl. halber Sterne an (nur Anzeige, keine Eingabe). */
export default function StarRating({ value, size = "md", showValue = false }: Props) {
  const clamped = Math.min(5, Math.max(0, value))
  const label = `${formatRating(clamped)} von 5 Sternen`
  return (
    <span className={`stars stars-${size}`} role="img" aria-label={label} title={label}>
      <span className="stars-track" aria-hidden="true">
        <span className="stars-empty">★★★★★</span>
        <span className="stars-full" style={{ width: `${(clamped / 5) * 100}%` }}>★★★★★</span>
      </span>
      {showValue && <span className="stars-value" aria-hidden="true">{formatRating(clamped)}</span>}
    </span>
  )
}
