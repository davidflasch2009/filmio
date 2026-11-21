import type { Ref } from "react"
import { formatRating } from "../lib/format"
import { starFillPercent } from "../lib/stars"
import { STAR_PATH } from "./Icons"

interface Props {
  value: number
  /** Sterngröße in px; die Abstände skalieren mit. */
  size?: number
  className?: string
  /** Für die Enthüllung: Zugriff auf die gefüllte Reihe, startet dann leer. */
  fillRef?: Ref<HTMLSpanElement>
  startEmpty?: boolean
  /** Grau statt gold – Bewertung aus den eigenen Notizen, nicht per Fragebogen. */
  muted?: boolean
}

function Row() {
  const star = (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d={STAR_PATH} />
    </svg>
  )
  return <>{star}{star}{star}{star}{star}</>
}

/** Zeigt 0,5–5 Sterne inkl. halber Sterne an (nur Anzeige, keine Eingabe). */
export default function StarRating({ value, size = 14, className, fillRef, startEmpty = false, muted = false }: Props) {
  const label = `${formatRating(value)} von 5 Sternen${muted ? " (aus Notizen)" : ""}`
  const cls = ["stars", muted ? "stars-muted" : "", className ?? ""].filter(Boolean).join(" ")
  return (
    <span className={cls} style={{ fontSize: size }} role="img" aria-label={label} title={label}>
      <span className="st-base"><Row /></span>
      <span className="st-fill" ref={fillRef} style={{ width: `${startEmpty ? 0 : starFillPercent(value)}%` }}><Row /></span>
    </span>
  )
}
