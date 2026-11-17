// Web Push ohne Bibliothek: Verschlüsselung nach RFC 8291 (aes128gcm) und VAPID nach RFC 8292.
// Läuft überall, wo es WebCrypto gibt (Deno/Supabase Edge Functions, Node ≥ 20).

export interface PushSubscriptionKeys {
  endpoint: string
  p256dh: string // base64url, 65 Bytes (unkomprimierter P-256-Punkt)
  auth: string // base64url, 16 Bytes
}

export interface VapidKeys {
  /** base64url, 65 Bytes – derselbe Schlüssel steht in der App (applicationServerKey). */
  publicKey: string
  /** Privater Schlüssel als JWK (EC, P-256). */
  privateJwk: JsonWebKey
  /** Kontakt für den Push-Dienst (mailto: oder https:). */
  subject: string
}

const enc = new TextEncoder()

export function b64urlDecode(s: string): Uint8Array {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4)
  const bin = atob(b64)
  return Uint8Array.from(bin, (c) => c.charCodeAt(0))
}

export function b64urlEncode(bytes: Uint8Array | ArrayBuffer): string {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  let bin = ""
  for (const b of u8) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let o = 0
  for (const p of parts) { out.set(p, o); o += p.length }
  return out
}

async function hmac(key: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const k = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"])
  return new Uint8Array(await crypto.subtle.sign("HMAC", k, data))
}

/** HKDF (RFC 5869) mit einer Ausgabe-Runde (≤ 32 Bytes). */
async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, length: number): Promise<Uint8Array> {
  const prk = await hmac(salt, ikm)
  return (await hmac(prk, concat(info, new Uint8Array([1])))).slice(0, length)
}

/** Verschlüsselt die Nachricht für ein Gerät (Content-Encoding: aes128gcm). */
export async function encryptPayload(
  payload: Uint8Array, p256dh: string, authSecret: string,
  // Für Tests fest vorgebbar:
  opts: { salt?: Uint8Array; serverKeys?: CryptoKeyPair } = {},
): Promise<Uint8Array> {
  const uaPublic = b64urlDecode(p256dh)
  const auth = b64urlDecode(authSecret)
  if (uaPublic.length !== 65 || auth.length !== 16) throw new Error("Ungültige Geräte-Schlüssel")

  const serverKeys = opts.serverKeys ?? await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]) as CryptoKeyPair
  const asPublic = new Uint8Array(await crypto.subtle.exportKey("raw", serverKeys.publicKey))
  const uaKey = await crypto.subtle.importKey("raw", uaPublic, { name: "ECDH", namedCurve: "P-256" }, false, [])
  const ecdhSecret = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: uaKey }, serverKeys.privateKey, 256))

  const keyInfo = concat(enc.encode("WebPush: info\0"), uaPublic, asPublic)
  const ikm = await hkdf(auth, ecdhSecret, keyInfo, 32)
  const salt = opts.salt ?? crypto.getRandomValues(new Uint8Array(16))
  const cek = await hkdf(salt, ikm, enc.encode("Content-Encoding: aes128gcm\0"), 16)
  const nonce = await hkdf(salt, ikm, enc.encode("Content-Encoding: nonce\0"), 12)

  // Ein einziger Datensatz: Nachricht + Trennbyte 0x02 (= letzter Datensatz).
  const plain = concat(payload, new Uint8Array([2]))
  const aes = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"])
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, aes, plain))

  const rs = 4096
  const header = new Uint8Array(16 + 4 + 1 + asPublic.length)
  header.set(salt, 0)
  new DataView(header.buffer).setUint32(16, rs)
  header[20] = asPublic.length
  header.set(asPublic, 21)
  return concat(header, cipher)
}

/** VAPID-Token (JWT, ES256) für den Push-Dienst des Endpoints. */
export async function vapidAuthorization(endpoint: string, vapid: VapidKeys, now = Math.floor(Date.now() / 1000)): Promise<string> {
  const aud = new URL(endpoint).origin
  const header = b64urlEncode(enc.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })))
  const body = b64urlEncode(enc.encode(JSON.stringify({ aud, exp: now + 12 * 3600, sub: vapid.subject })))
  const key = await crypto.subtle.importKey("jwk", { ...vapid.privateJwk, key_ops: ["sign"], ext: true }, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"])
  // WebCrypto liefert die Signatur bereits im JWS-Format (r||s, 64 Bytes).
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, enc.encode(`${header}.${body}`))
  return `vapid t=${header}.${body}.${b64urlEncode(sig)}, k=${vapid.publicKey}`
}

export interface PushMessage {
  title: string
  body: string
  /** Wohin ein Tipp auf die Mitteilung führt (relativ zur App). */
  url?: string
  tag?: string
}

/** Schickt eine Mitteilung. Gibt den HTTP-Status zurück (404/410 = Gerät abgemeldet). */
export async function sendPush(sub: PushSubscriptionKeys, message: PushMessage, vapid: VapidKeys): Promise<number> {
  const body = await encryptPayload(enc.encode(JSON.stringify(message)), sub.p256dh, sub.auth)
  const res = await fetch(sub.endpoint, {
    method: "POST",
    headers: {
      authorization: await vapidAuthorization(sub.endpoint, vapid),
      "content-encoding": "aes128gcm",
      "content-type": "application/octet-stream",
      ttl: String(24 * 3600),
      urgency: "normal",
      ...(message.tag ? { topic: message.tag.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 32) } : {}),
    },
    body,
  })
  await res.body?.cancel()
  return res.status
}
