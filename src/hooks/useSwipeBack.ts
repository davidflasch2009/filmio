import { useEffect, useRef, type RefObject } from "react"

/** So nah am linken Rand muss die Geste beginnen (px). */
const EDGE = 28
/** Ab dieser Strecke (oder bei schnellem Wisch) wird geschlossen. */
const CLOSE_DISTANCE = 90

/**
 * Wischen vom linken Bildschirmrand schließt eine Vollbild-Ebene – wie die Zurück-Geste in iOS-Apps.
 * Die Ebene folgt dem Finger; lässt man früh los, schnappt sie zurück.
 */
export function useSwipeBack(ref: RefObject<HTMLElement | null>, onClose: () => void): void {
  // Immer die aktuelle Funktion aufrufen, ohne die Gesten-Listener bei jedem Render neu zu setzen.
  const closeRef = useRef(onClose)
  useEffect(() => { closeRef.current = onClose })

  useEffect(() => {
    const el = ref.current
    if (!el) return
    let startX = 0
    let startY = 0
    let startTime = 0
    let dx = 0
    let tracking = false
    let dragging = false
    let closing = false

    const reset = (animate: boolean) => {
      el.style.transition = animate ? "transform .22s cubic-bezier(.2,.85,.25,1)" : ""
      el.style.transform = ""
      el.style.boxShadow = ""
      if (animate) window.setTimeout(() => { el.style.transition = "" }, 240)
    }

    const onStart = (e: TouchEvent) => {
      if (closing || e.touches.length !== 1) return
      const t = e.touches[0]
      tracking = t.clientX <= EDGE
      dragging = false
      startX = t.clientX
      startY = t.clientY
      startTime = e.timeStamp
      dx = 0
    }
    const onMove = (e: TouchEvent) => {
      if (!tracking || closing) return
      const t = e.touches[0]
      dx = t.clientX - startX
      const dy = t.clientY - startY
      if (!dragging) {
        if (Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(dx)) { tracking = false; return } // senkrechtes Scrollen
        if (dx < 8) return
        dragging = true
        el.style.transition = "none"
        el.style.boxShadow = "-18px 0 40px rgba(0,0,0,.5)"
      }
      e.preventDefault()
      el.style.transform = `translateX(${Math.max(0, dx)}px)`
    }
    const onEnd = (e: TouchEvent) => {
      if (!tracking) return
      tracking = false
      if (!dragging) return
      dragging = false
      const fast = dx > 36 && dx / Math.max(1, e.timeStamp - startTime) > 0.45
      if (dx > CLOSE_DISTANCE || fast) {
        closing = true
        el.style.transition = "transform .2s ease-in"
        el.style.transform = "translateX(100%)"
        window.setTimeout(() => closeRef.current(), 190)
      } else {
        reset(true)
      }
    }
    const onCancel = () => {
      if (dragging && !closing) reset(true)
      tracking = false
      dragging = false
    }

    el.addEventListener("touchstart", onStart, { passive: true })
    el.addEventListener("touchmove", onMove, { passive: false })
    el.addEventListener("touchend", onEnd)
    el.addEventListener("touchcancel", onCancel)
    return () => {
      el.removeEventListener("touchstart", onStart)
      el.removeEventListener("touchmove", onMove)
      el.removeEventListener("touchend", onEnd)
      el.removeEventListener("touchcancel", onCancel)
    }
  }, [ref])
}
