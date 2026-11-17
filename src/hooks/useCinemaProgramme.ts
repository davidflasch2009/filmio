import { useEffect, useState } from "react"
import { cachedProgramme, loadProgramme, type CpxMovie } from "../lib/cineplexx"

/** Kinoprogramm (Cineplexx Österreich), sobald ein Kino gewählt ist – sonst null. */
export function useCinemaProgramme(cinemaId: string | null, online: boolean): CpxMovie[] | null {
  const [list, setList] = useState<CpxMovie[] | null>(() => (cinemaId ? cachedProgramme() : null))
  useEffect(() => {
    if (!cinemaId || !online) return
    let cancelled = false
    loadProgramme().then((l) => { if (!cancelled) setList(l) }, () => {})
    return () => { cancelled = true }
  }, [cinemaId, online])
  return cinemaId ? list : null
}
