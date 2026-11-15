import type { ReactNode } from "react"
import { useOnline } from "../hooks/useOnline"

interface Props {
  id: string
  title: string
  subtitle?: ReactNode
  /** Knopf rechts neben der Überschrift. */
  action?: ReactNode
  children?: ReactNode
}

/** Große Überschrift im iOS-Stil, darunter optional Untertitel und Bedienelemente. */
export default function ViewHeader({ id, title, subtitle, action, children }: Props) {
  const online = useOnline()
  return (
    <header className="view-head">
      <div className="view-title-row">
        <h1 id={id} className="view-title">{title}</h1>
        {(!online || action) && (
          <div className="view-actions">
            {!online && <span className="offline-pill">Offline</span>}
            {action}
          </div>
        )}
      </div>
      {subtitle && <p className="view-sub">{subtitle}</p>}
      {children}
    </header>
  )
}
