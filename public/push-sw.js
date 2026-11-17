// Mitteilungen für filmio (wird vom generierten Service Worker per importScripts geladen).
self.addEventListener("push", (event) => {
  let data = {}
  try { data = event.data ? event.data.json() : {} } catch { data = { body: event.data ? event.data.text() : "" } }
  const url = new URL(data.url || "./", self.registration.scope).href
  event.waitUntil(self.registration.showNotification(data.title || "filmio", {
    body: data.body || "",
    icon: new URL("icons/icon-192.png", self.registration.scope).href,
    badge: new URL("icons/icon-192.png", self.registration.scope).href,
    tag: data.tag || undefined,
    data: { url },
  }))
})

self.addEventListener("notificationclick", (event) => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || self.registration.scope
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true })
    const open = windows.find((w) => w.url.startsWith(self.registration.scope))
    if (open) {
      await open.focus()
      open.postMessage({ type: "filmio-open", url })
      return
    }
    await self.clients.openWindow(url)
  })())
})
