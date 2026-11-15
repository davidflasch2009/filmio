import type { ReactNode } from "react"
import { useOnline } from "../hooks/useOnline"

interface Props {
  id: string
  title: string
  subtitle?: ReactNode
  children?: ReactNode
}

/** Große Überschrift im iOS-Stil, darunter optional Untertitel und Bedienelemente. */
export default function ViewHeader({ id, title, subtitle, children }: Props) {
  const online = useOnline()
  return (
    <header className="view-head">
      <div className="view-title-row">
        <h1 id={id} className="view-title">{title}</h1>
        {!online && <span className="offline-pill">Offline</span>}
      </div>
      {subtitle && <p className="view-sub">{subtitle}</p>}
      {children}
    </header>
  )
}
