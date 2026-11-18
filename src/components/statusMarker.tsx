import type { ReactNode } from "react"
import type { Film } from "../types"
import { IconBookmark, IconCheck, IconHistory } from "./Icons"

/** Symbol + Beschriftung für einen gespeicherten Film (für die Poster-Ecke einer FilmCard). */
export function statusMarker(film: Film | undefined): { icon: ReactNode; label: string } | undefined {
  if (!film) return undefined
  if (film.status === "watchlist") return { icon: <IconBookmark />, label: "Auf der Watchlist" }
  return film.rating === null ? { icon: <IconHistory />, label: "Früher gesehen" } : { icon: <IconCheck />, label: "Gesehen" }
}
