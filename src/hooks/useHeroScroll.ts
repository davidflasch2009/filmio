import { useEffect, type RefObject } from "react"

/** So viel langsamer als der Inhalt läuft das Szenenbild mit (0,5 = halb so schnell). */
const PARALLAX = 0.5
/** Über diese Strecke blendet der Streifen oben ein (px). */
const BAR_FADE = 48

interface Parts {
  /** Der scrollende Bereich (die Detailseite). */
  scroller: RefObject<HTMLElement | null>
  /** Rahmen des Szenenbilds – wird beim Überziehen nach unten größer. */
  hero: RefObject<HTMLElement | null>
  /** Bildebene im Rahmen – läuft langsamer mit. */
  layer: RefObject<HTMLElement | null>
  /** Unscharfe Kopie des Bilds – wird beim Hochscrollen eingeblendet. */
  blur: RefObject<HTMLElement | null>
  /** Abdunklung über dem Bild. */
  shade: RefObject<HTMLElement | null>
  /** Ab hier läuft Inhalt unter die Statusleiste (Poster + Titel). */
  content: RefObject<HTMLElement | null>
  /** Verschwommener Streifen oben. */
  bar: RefObject<HTMLElement | null>
}

/**
 * Scrollen auf der Detailseite wie bei Apple TV: Szenenbild läuft halb so schnell mit und wird dabei dunkler und
 * leicht unscharf, beim Überziehen am oberen Rand wächst es mit, und sobald Inhalt unter die Statusleiste läuft,
 * blendet oben ein verschwommener Streifen ein. Schreibt direkt ins DOM (kein React-Render pro Scroll-Schritt).
 */
export function useHeroScroll(parts: Parts, deps: unknown[]): void {
  useEffect(() => {
    const el = parts.scroller.current
    if (!el) return
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false
    let frame = 0

    const update = () => {
      frame = 0
      const y = el.scrollTop
      const hero = parts.hero.current
      const h = hero?.offsetHeight ?? 0
      if (hero && h > 0) {
        // Überziehen (iOS meldet dann negative Werte): Bild wächst nach oben, die Unterkante bleibt stehen.
        hero.style.transform = y < 0 ? `scale(${(h - y) / h})` : ""
        const p = Math.min(Math.max(y / h, 0), 1)
        if (!reduce && parts.layer.current) parts.layer.current.style.transform = y > 0 ? `translate3d(0, ${Math.min(y, h) * PARALLAX}px, 0)` : ""
        if (!reduce && parts.blur.current) parts.blur.current.style.opacity = String(p)
        if (parts.shade.current) parts.shade.current.style.opacity = String(p * 0.75)
      }
      const bar = parts.bar.current
      const content = parts.content.current
      if (bar && content) {
        const start = content.offsetTop - bar.offsetHeight
        bar.style.opacity = String(Math.min(Math.max((y - start) / BAR_FADE, 0), 1))
      }
    }
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(update) }

    update()
    el.addEventListener("scroll", onScroll, { passive: true })
    window.addEventListener("resize", onScroll)
    return () => {
      el.removeEventListener("scroll", onScroll)
      window.removeEventListener("resize", onScroll)
      if (frame) cancelAnimationFrame(frame)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
}
