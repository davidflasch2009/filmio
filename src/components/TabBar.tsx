export type Tab = "search" | "watched" | "watchlist" | "more"

interface Props {
  active: Tab
  onChange: (tab: Tab) => void
  counts: { watched: number; watchlist: number }
}

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "search", label: "Suche", icon: "🔍" },
  { id: "watched", label: "Gesehen", icon: "✓" },
  { id: "watchlist", label: "Watchlist", icon: "＋" },
  { id: "more", label: "Mehr", icon: "⋯" },
]

export default function TabBar({ active, onChange, counts }: Props) {
  return (
    <nav className="tabbar" aria-label="Hauptnavigation">
      {TABS.map((t) => {
        const count = t.id === "watched" ? counts.watched : t.id === "watchlist" ? counts.watchlist : null
        return (
          <button
            key={t.id}
            type="button"
            className={`tab${active === t.id ? " tab-active" : ""}`}
            aria-current={active === t.id ? "page" : undefined}
            onClick={() => onChange(t.id)}
          >
            <span className="tab-icon" aria-hidden="true">{t.icon}</span>
            <span className="tab-label">
              {t.label}
              {count !== null && count > 0 && <span className="tab-count"> {count}</span>}
            </span>
          </button>
        )
      })}
    </nav>
  )
}
