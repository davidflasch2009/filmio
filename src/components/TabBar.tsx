import type { ReactNode } from "react"
import { IconBookmark, IconEye, IconHistory, IconMore, IconSearch } from "./Icons"

export type Tab = "watched" | "watchlist" | "earlier" | "search" | "more"

interface Props {
  active: Tab
  onChange: (tab: Tab) => void
}

const TABS: { id: Tab; label: string; icon: ReactNode }[] = [
  { id: "watched", label: "Gesehen", icon: <IconEye /> },
  { id: "watchlist", label: "Watchlist", icon: <IconBookmark /> },
  { id: "earlier", label: "Früher", icon: <IconHistory /> },
  { id: "search", label: "Suche", icon: <IconSearch /> },
  { id: "more", label: "Mehr", icon: <IconMore /> },
]

/** Schwebende Tab-Leiste aus Milchglas. */
export default function TabBar({ active, onChange }: Props) {
  return (
    <nav className="tabbar" aria-label="Hauptnavigation">
      {TABS.map((t) => (
        <button
          key={t.id}
          type="button"
          className={`tab${active === t.id ? " tab-active" : ""}`}
          aria-current={active === t.id ? "page" : undefined}
          onClick={() => onChange(t.id)}
        >
          {t.icon}
          <span className="tab-label">{t.label}</span>
        </button>
      ))}
    </nav>
  )
}
