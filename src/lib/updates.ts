/**
 * Neue App-Versionen sofort übernehmen.
 *
 * Der Service Worker (vite-plugin-pwa, autoUpdate) installiert eine neue Version im Hintergrund,
 * die geöffnete Seite läuft aber noch mit der alten weiter. Deshalb:
 * - beim Zurückkehren in die App nach einem Update suchen,
 * - sobald die neue Version übernimmt, die Seite neu laden – aber nie mitten in einer
 *   Detailseite oder im Fragebogen, dann erst, wenn die App in den Hintergrund geht.
 */
export function setupAutoUpdate(): void {
  if (!("serviceWorker" in navigator)) return
  const sw = navigator.serviceWorker
  // Aktuell aktive Version. Beim allerersten Besuch gibt es noch keine – deren Übernahme ist kein Update.
  let current = sw.controller
  let reloadPending = false

  const busy = () => document.body.classList.contains("no-scroll") // Detailseite/Fragebogen offen
  const reload = () => {
    if (busy()) reloadPending = true
    else window.location.reload()
  }

  sw.addEventListener("controllerchange", () => {
    const wasControlled = current !== null
    current = sw.controller
    if (wasControlled) reload()
  })

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      sw.getRegistration().then((r) => r?.update()).catch(() => {})
    } else if (reloadPending) {
      window.location.reload()
    }
  })
}

/** Stand der App (Build-Zeit + Commit), z.B. „15.11.2026, 21:30 · 261f87a“. */
export function appVersion(): string {
  const time = new Date(__BUILD_TIME__)
  const when = Number.isNaN(time.getTime())
    ? ""
    : time.toLocaleString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })
  return [when, __BUILD_SHA__].filter(Boolean).join(" · ")
}
