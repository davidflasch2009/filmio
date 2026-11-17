import { useEffect, useState } from "react"
import { cachedProgramme, loadProgramme, type CpxMovie } from "../lib/cineplexx"

/** Kinoprogramm (Cineplexx Österreich), sobald ein Kino gewählt ist – sonst null. Bei Fehlern später nochmal. */
export function useCinemaProgramme(cinemaId: string | null, online: boolean): CpxMovie[] | null {
  const [list, setList] = useState<CpxMovie[] | null>(() => (cinemaId ? cachedProgramme() : null))
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    if (!cinemaId || !online) return
    let cancelled = false
    let retry: ReturnType<typeof setTimeout> | undefined
    loadProgramme().then(
      (l) => { if (!cancelled) setList(l) },
      () => { if (!cancelled && attempt < 5) retry = setTimeout(() => setAttempt((a) => a + 1), 20_000 * (attempt + 1)) },
    )
    return () => { cancelled = true; clearTimeout(retry) }
  }, [cinemaId, online, attempt])
  return cinemaId ? list : null
}
