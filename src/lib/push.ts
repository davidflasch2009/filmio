// Mitteilungen auf diesem Gerät an- und abmelden.
import { deletePushSubscription, savePushSubscription, sendTestPush, shareTmdbToken } from "./cloud"
import { tmdbTokenForServer } from "./tmdb"

/** Öffentlicher VAPID-Schlüssel des Servers (der private liegt nur in Supabase). */
const VAPID_PUBLIC = "BLdMm8VgMElTdkWhWGhd0Xh7RWZ3n5Ttg9Cpclp8scfxhw12zZekje2IMums0IHnhtOK5iNbOExEoe1yo_VAhJY"

export type PushSupport = "ok" | "ios-browser" | "unsupported"

/** Kann dieses Gerät Mitteilungen empfangen? Auf dem iPhone nur aus der App auf dem Home-Bildschirm. */
export function pushSupport(): PushSupport {
  if ("serviceWorker" in navigator && "PushManager" in window && "Notification" in window) return "ok"
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  return ios ? "ios-browser" : "unsupported"
}

function keyBytes(b64url: string): Uint8Array<ArrayBuffer> {
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((b64url.length + 3) % 4)
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
}

/** Bereitschaft des Service Workers – mit Zeitlimit, damit nichts ewig hängt. */
async function registration(): Promise<ServiceWorkerRegistration> {
  const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Service Worker nicht bereit")), 8000))
  return Promise.race([navigator.serviceWorker.ready, timeout])
}

export async function currentSubscription(): Promise<PushSubscription | null> {
  if (pushSupport() !== "ok") return null
  try {
    return await (await registration()).pushManager.getSubscription()
  } catch {
    return null
  }
}

/** Gerät beim Server eintragen (auch zum Auffrischen, z.B. nach einem Landwechsel). */
export async function registerSubscription(sub: PushSubscription, region: string): Promise<void> {
  const keys = sub.toJSON().keys ?? {}
  if (!keys.p256dh || !keys.auth) throw new Error("Das Gerät hat keine Schlüssel geliefert.")
  await savePushSubscription({ endpoint: sub.endpoint, p256dh: keys.p256dh, auth: keys.auth, region })
}

export class PushDenied extends Error {}

/** Mitteilungen einschalten. Muss direkt aus einem Tippen heraus aufgerufen werden (iOS). */
export async function enablePush(region: string): Promise<PushSubscription> {
  const permission = await Notification.requestPermission()
  if (permission !== "granted") throw new PushDenied(permission)
  const reg = await registration()
  const sub = (await reg.pushManager.getSubscription()) ??
    await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID_PUBLIC) })
  await registerSubscription(sub, region)
  await shareTmdbToken(tmdbTokenForServer())
  return sub
}

export async function disablePush(): Promise<void> {
  const sub = await currentSubscription()
  if (!sub) return
  try { await deletePushSubscription(sub.endpoint) } catch { /* Server räumt abgemeldete Geräte selbst auf */ }
  await sub.unsubscribe()
}

export async function testPush(): Promise<void> {
  const sub = await currentSubscription()
  if (!sub) throw new Error("Mitteilungen sind auf diesem Gerät nicht eingeschaltet.")
  await sendTestPush(sub.endpoint)
}
