import { useEffect } from "react"

/**
 * iOS-Fehler in installierten Web-Apps: Nach Zoom oder Tastatur liegt der sichtbare Bereich manchmal verschoben
 * zu dem, woran sich `position: fixed` ausrichtet – Tab-Leiste und Statusleisten-Abdeckung scrollen dann mit.
 * Hier wird der Versatz gemessen und als CSS-Variablen (--vv-top, --vv-bottom) gesetzt; normal sind beide 0.
 */
export function useViewportFix(): void {
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    const root = document.documentElement.style
    let frame = 0
    const update = () => {
      frame = 0
      const top = Math.round(vv.offsetTop)
      const bottom = Math.round(vv.offsetTop + vv.height - window.innerHeight)
      root.setProperty("--vv-top", `${top}px`)
      root.setProperty("--vv-bottom", `${bottom}px`)
    }
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update) }
    update()
    vv.addEventListener("resize", schedule)
    vv.addEventListener("scroll", schedule)
    window.addEventListener("scroll", schedule, { passive: true })
    return () => {
      vv.removeEventListener("resize", schedule)
      vv.removeEventListener("scroll", schedule)
      window.removeEventListener("scroll", schedule)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [])
}
