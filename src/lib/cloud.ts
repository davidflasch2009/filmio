// Zugang zum eigenen Supabase-Projekt: Anmeldung (genau ein Account) und die gespeicherte Liste.
// Bewusst ohne SDK – nur die paar REST-Aufrufe, die filmio braucht.

/** Öffentliche Projekt-Adresse und Publishable Key – beide sind dafür gedacht, in der App zu stehen.
 *  Geschützt wird über die Anmeldung: Ohne Account kommt niemand an die Daten (Row Level Security). */
const BASE = import.meta.env.VITE_SUPABASE_URL ?? "https://jfgmnymdmttwtchnxjld.supabase.co"
const KEY = import.meta.env.VITE_SUPABASE_KEY ?? "sb_publishable_jPVoG0z50LAkqWZ4TvE04A_7-5WkYL2"

export const SESSION_KEY = "filmio.session"

export interface Session {
  accessToken: string
  refreshToken: string
  /** Ablauf des Access Tokens (ms seit 1970). */
  expiresAt: number
  userId: string
  name: string
}

export type CloudErrorKind = "offline" | "auth" | "server"

export class CloudError extends Error {
  kind: CloudErrorKind
  /** HTTP-Status (0 = keine Antwort). */
  status: number
  constructor(message: string, kind: CloudErrorKind, status = 0) {
    super(message)
    this.kind = kind
    this.status = status
  }
}

// ---------------------------------------------------------------------------
// Name ↔ interne Adresse
// ---------------------------------------------------------------------------

/** Der Name wird intern zu einer Adresse, an die nie eine Mail zugestellt werden kann (.invalid). */
export function nameToEmail(name: string): string | null {
  const slug = name.trim().toLowerCase()
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
  if (!/^[a-z0-9][a-z0-9._-]{1,31}$/.test(slug)) return null
  return `${slug}@filmio.invalid`
}

export const NAME_RULE = "2–32 Zeichen: Buchstaben, Zahlen, Punkt, Strich"

// ---------------------------------------------------------------------------
// Sitzung (bleibt auf dem Gerät, bis man sich abmeldet)
// ---------------------------------------------------------------------------

export function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const s = JSON.parse(raw) as Partial<Session>
    if (typeof s.accessToken !== "string" || typeof s.refreshToken !== "string" || typeof s.userId !== "string") return null
    return { accessToken: s.accessToken, refreshToken: s.refreshToken, expiresAt: Number(s.expiresAt) || 0, userId: s.userId, name: typeof s.name === "string" ? s.name : "" }
  } catch {
    return null
  }
}

function storeSession(session: Session | null) {
  try {
    if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session))
    else localStorage.removeItem(SESSION_KEY)
  } catch {
    // Ohne Speicher bleibt die Sitzung nur bis zum Neuladen.
  }
}

type SessionListener = (session: Session | null) => void
const sessionListeners = new Set<SessionListener>()

/** Meldet An- und Abmeldung (auch eine abgelaufene Anmeldung). */
export function onSessionChange(fn: SessionListener): () => void {
  sessionListeners.add(fn)
  return () => { sessionListeners.delete(fn) }
}

function setSession(session: Session | null) {
  storeSession(session)
  sessionListeners.forEach((fn) => fn(session))
}

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------

interface AuthResponse {
  access_token: string
  refresh_token: string
  expires_in: number
  user: { id: string; user_metadata?: { name?: unknown } }
}

function errorMessage(status: number, body: unknown): string {
  const b = (body ?? {}) as { code?: unknown; error_code?: unknown; message?: unknown; msg?: unknown; error_description?: unknown }
  const code = String(b.error_code ?? b.code ?? "")
  const text = String(b.message ?? b.msg ?? b.error_description ?? "")
  if (code === "invalid_credentials" || /invalid login credentials/i.test(text)) return "Name oder Passwort ist falsch."
  if (/bereits einen Account/i.test(text) || code === "user_already_exists") return "Es gibt schon einen Account – bitte anmelden."
  if (code === "weak_password" || /password should be/i.test(text)) return "Das Passwort ist zu kurz (mindestens 6 Zeichen)."
  if (status === 429 || code === "over_request_rate_limit") return "Zu viele Versuche – bitte kurz warten."
  if (status >= 500) return "Der Server antwortet gerade nicht. Bitte später noch einmal versuchen."
  return `Unerwartete Antwort vom Server (${status}).`
}

async function request<T>(path: string, init: { method?: string; body?: unknown; token?: string } = {}): Promise<T> {
  let res: Response
  try {
    res = await fetch(BASE + path, {
      method: init.method ?? "GET",
      headers: {
        apikey: KEY,
        "content-type": "application/json",
        ...(init.token ? { authorization: `Bearer ${init.token}` } : {}),
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    })
  } catch {
    throw new CloudError("Keine Verbindung zum Server.", "offline")
  }
  const body: unknown = await res.json().catch(() => null)
  if (!res.ok) {
    const kind: CloudErrorKind = res.status === 401 || res.status === 403 ? "auth" : "server"
    throw new CloudError(errorMessage(res.status, body), kind, res.status)
  }
  return body as T
}

function toSession(r: AuthResponse, fallbackName: string): Session {
  const metaName = r.user.user_metadata?.name
  return {
    accessToken: r.access_token,
    refreshToken: r.refresh_token,
    expiresAt: Date.now() + r.expires_in * 1000,
    userId: r.user.id,
    name: typeof metaName === "string" && metaName.trim() ? metaName : fallbackName,
  }
}

// ---------------------------------------------------------------------------
// Anmeldung
// ---------------------------------------------------------------------------

/** Gibt es den einen Account schon? (Entscheidet zwischen „Account erstellen“ und „Anmelden“.) */
export function accountExists(): Promise<boolean> {
  return request<boolean>("/rest/v1/rpc/filmio_account_exists", { method: "POST", body: {} })
}

function emailOrThrow(name: string): string {
  const email = nameToEmail(name)
  if (!email) throw new CloudError(`Ungültiger Name (${NAME_RULE}).`, "server")
  return email
}

export async function signUp(name: string, password: string): Promise<Session> {
  const r = await request<AuthResponse>("/auth/v1/signup", {
    method: "POST",
    body: { email: emailOrThrow(name), password, data: { name: name.trim() } },
  })
  if (!r.access_token) throw new CloudError("Der Account wurde angelegt, die Anmeldung aber nicht bestätigt.", "server")
  const session = toSession(r, name.trim())
  setSession(session)
  return session
}

export async function signIn(name: string, password: string): Promise<Session> {
  const r = await request<AuthResponse>("/auth/v1/token?grant_type=password", {
    method: "POST",
    body: { email: emailOrThrow(name), password },
  })
  const session = toSession(r, name.trim())
  setSession(session)
  return session
}

/** Abmelden: die Sitzung auf diesem Gerät beenden. Die Liste bleibt gespeichert. */
export async function signOut(): Promise<void> {
  const session = loadSession()
  setSession(null)
  if (session) {
    try {
      await request("/auth/v1/logout?scope=local", { method: "POST", token: session.accessToken })
    } catch {
      // Offline o.ä.: lokal ist man trotzdem abgemeldet.
    }
  }
}

let refreshing: Promise<Session> | null = null

async function refresh(session: Session): Promise<Session> {
  refreshing ??= (async () => {
    try {
      const r = await request<AuthResponse>("/auth/v1/token?grant_type=refresh_token", {
        method: "POST",
        body: { refresh_token: session.refreshToken },
      })
      const next = toSession(r, session.name)
      setSession(next)
      return next
    } catch (e) {
      // Abgelaufene / widerrufene Anmeldung (400/401) → neu anmelden. Offline: Sitzung behalten.
      if (e instanceof CloudError && e.status >= 400 && e.status < 500 && e.status !== 429) {
        setSession(null)
        throw new CloudError("Bitte melde dich erneut an.", "auth")
      }
      throw e
    } finally {
      refreshing = null
    }
  })()
  return refreshing
}

/** Gültiger Access Token (wird bei Bedarf erneuert). */
async function token(force = false): Promise<string> {
  const session = loadSession()
  if (!session) throw new CloudError("Nicht angemeldet.", "auth")
  if (!force && session.expiresAt - 60_000 > Date.now()) return session.accessToken
  return (await refresh(session)).accessToken
}

/** Aufruf mit Anmeldung; bei 401 einmal mit erneuertem Token wiederholen. */
async function authed<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  try {
    return await request<T>(path, { ...init, token: await token() })
  } catch (e) {
    if (!(e instanceof CloudError) || e.kind !== "auth" || !loadSession()) throw e
    return request<T>(path, { ...init, token: await token(true) })
  }
}

// ---------------------------------------------------------------------------
// Daten
// ---------------------------------------------------------------------------

export interface RemoteStore {
  data: unknown
  rev: number
}

/** Liste vom Server (null = noch nie gespeichert). */
export async function pullRemote(): Promise<RemoteStore | null> {
  const rows = await authed<{ data: unknown; rev: number }[]>("/rest/v1/filmio_store?select=data,rev")
  return rows[0] ? { data: rows[0].data, rev: Number(rows[0].rev) } : null
}

/** Speichert nur, wenn der Server noch auf Stand `rev` ist. Gibt die neue Revision zurück, sonst null (Konflikt). */
export async function pushRemote(data: unknown, rev: number): Promise<number | null> {
  const r = await authed<number | null>("/rest/v1/rpc/filmio_save", { method: "POST", body: { p_data: data, p_rev: rev } })
  return r === null ? null : Number(r)
}
