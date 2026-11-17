// filmio-notify: einmal am Tag (pg_cron) prüfen, ob Watchlist-Filme neu bei meinen Diensten laufen
// oder heute ins Kino kommen, und Mitteilungen an die angemeldeten Geräte schicken.
// Außerdem: Test-Mitteilung an das eigene Gerät (aus der App).
import { sendPush, type PushMessage, type VapidKeys } from "./webpush.ts"
import { computeNotifications, factsFromTmdb, todayBerlin, type FilmFacts, type NotifyState, type Region, type StoreFilm, type StoreService } from "./notify.ts"

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
const CRON_SECRET = Deno.env.get("FILMIO_CRON_SECRET") ?? ""
const vapid: VapidKeys = {
  publicKey: Deno.env.get("FILMIO_VAPID_PUBLIC") ?? "",
  privateJwk: JSON.parse(Deno.env.get("FILMIO_VAPID_PRIVATE_JWK") ?? "{}"),
  subject: "mailto:noreply@example.com",
}

const cors = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, apikey, content-type, x-client-info",
  "access-control-allow-methods": "POST, OPTIONS",
}
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "content-type": "application/json" } })

async function db<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: SERVICE_KEY, authorization: `Bearer ${SERVICE_KEY}`, "content-type": "application/json", ...(init.headers ?? {}) },
  })
  if (!res.ok) throw new Error(`DB ${path}: ${res.status} ${await res.text()}`)
  const text = await res.text()
  return (text ? JSON.parse(text) : null) as T
}

interface Sub { endpoint: string; user_id: string; p256dh: string; auth: string; region: Region }

/** Schickt an alle Geräte; abgemeldete Geräte (404/410) werden gelöscht. */
async function deliver(subs: Sub[], message: PushMessage): Promise<{ endpoint: string; status: number }[]> {
  const out = []
  for (const s of subs) {
    let status = 0
    try { status = await sendPush(s, message, vapid) } catch { status = 0 }
    if (status === 404 || status === 410) {
      await db(`filmio_push?endpoint=eq.${encodeURIComponent(s.endpoint)}`, { method: "DELETE" })
    }
    out.push({ endpoint: new URL(s.endpoint).host, status })
  }
  return out
}

async function tmdbFacts(ids: number[], token: string): Promise<Map<number, FilmFacts>> {
  const facts = new Map<number, FilmFacts>()
  const queue = [...ids]
  const worker = async () => {
    while (queue.length) {
      const id = queue.shift()!
      const res = await fetch(`https://api.themoviedb.org/3/movie/${id}?language=de-DE&append_to_response=watch/providers,release_dates`, {
        headers: { authorization: `Bearer ${token}`, accept: "application/json" },
      })
      if (res.ok) facts.set(id, factsFromTmdb(await res.json()))
      else await res.body?.cancel()
    }
  }
  await Promise.all([worker(), worker(), worker(), worker()])
  return facts
}

async function dailyRun(dryRun: boolean) {
  const [config] = await db<{ value: string }[]>("filmio_config?key=eq.tmdb_token&select=value")
  if (!config) return { skipped: "kein TMDB-Token hinterlegt" }
  const stores = await db<{ user_id: string; data: { films?: StoreFilm[]; services?: { list?: StoreService[] } } }[]>("filmio_store?select=user_id,data")
  const today = todayBerlin()
  const report = []
  for (const store of stores) {
    const subs = await db<Sub[]>(`filmio_push?user_id=eq.${store.user_id}&select=endpoint,user_id,p256dh,auth,region`)
    if (subs.length === 0) { report.push({ user: "…", skipped: "keine Geräte" }); continue }
    const films = (store.data.films ?? []).filter((f) => f.status === "watchlist")
    const services = store.data.services?.list ?? []
    const facts = await tmdbFacts(films.map((f) => f.tmdbId), config.value)
    const [row] = await db<{ state: NotifyState }[]>(`filmio_notify_state?user_id=eq.${store.user_id}&select=state`)
    const prev: NotifyState = row?.state ?? {}
    const next: NotifyState = { ...prev }
    const regions = [...new Set(subs.map((s) => s.region))]
    const sent = []
    for (const region of regions) {
      const { messages, state } = computeNotifications(films, services, facts, prev[region], region, today)
      next[region] = state
      for (const m of messages) {
        sent.push({ region, message: m, delivered: dryRun ? [] : await deliver(subs.filter((s) => s.region === region), m) })
      }
    }
    if (!dryRun) {
      await db("filmio_notify_state", {
        method: "POST",
        headers: { prefer: "resolution=merge-duplicates" },
        body: JSON.stringify({ user_id: store.user_id, state: next, updated_at: new Date().toISOString() }),
      })
    }
    report.push({ today, films: films.length, checked: facts.size, services: services.map((s) => s.name), sent, state: next })
  }
  return { dryRun, report }
}

/** Test-Mitteilung an ein Gerät des angemeldeten Nutzers. */
async function testPush(req: Request, endpoint: string) {
  const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: SERVICE_KEY, authorization: req.headers.get("authorization") ?? "" } })
  if (!userRes.ok) { await userRes.body?.cancel(); return json(401, { error: "nicht angemeldet" }) }
  const user = await userRes.json() as { id: string }
  const subs = await db<Sub[]>(`filmio_push?user_id=eq.${user.id}&endpoint=eq.${encodeURIComponent(endpoint)}&select=endpoint,user_id,p256dh,auth,region`)
  if (subs.length === 0) return json(404, { error: "Gerät nicht angemeldet" })
  const [result] = await deliver(subs, {
    title: "filmio",
    body: "Benachrichtigungen sind eingerichtet. Du hörst von mir, wenn ein Watchlist-Film bei deinen Diensten läuft oder ins Kino kommt.",
    url: "?tab=watchlist",
    tag: "test",
  })
  return json(result.status >= 200 && result.status < 300 ? 200 : 502, result)
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors })
  if (req.method !== "POST") return json(405, { error: "nur POST" })
  try {
    const body = await req.json().catch(() => ({})) as { mode?: string; endpoint?: string; dryRun?: boolean }
    if (body.mode === "test" && body.endpoint) return await testPush(req, body.endpoint)
    if (CRON_SECRET && req.headers.get("x-filmio-cron") === CRON_SECRET) return json(200, await dailyRun(!!body.dryRun))
    return json(401, { error: "nicht erlaubt" })
  } catch (e) {
    return json(500, { error: String(e instanceof Error ? e.message : e) })
  }
})
