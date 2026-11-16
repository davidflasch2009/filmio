import { useEffect, useState, type FormEvent } from "react"
import { accountExists, CloudError, NAME_RULE, nameToEmail, signIn, signUp, type Session } from "../lib/cloud"

interface Props {
  onSignedIn: (session: Session) => void
}

type Mode = "loading" | "create" | "login" | "unreachable"

/** Vor der App: Account erstellen (nur beim allerersten Mal) oder anmelden. */
export default function LoginScreen({ onSignedIn }: Props) {
  const [mode, setMode] = useState<Mode>("loading")
  const [attempt, setAttempt] = useState(0)
  const [name, setName] = useState("")
  const [password, setPassword] = useState("")
  const [repeat, setRepeat] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    accountExists()
      .then((exists) => { if (!cancelled) setMode(exists ? "login" : "create") })
      .catch(() => { if (!cancelled) setMode("unreachable") })
    return () => { cancelled = true }
  }, [attempt])

  function retry() {
    setMode("loading")
    setAttempt((n) => n + 1)
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!nameToEmail(name)) {
      setError(`Name: ${NAME_RULE}.`)
      return
    }
    if (password.length < 6) {
      setError("Das Passwort braucht mindestens 6 Zeichen.")
      return
    }
    if (mode === "create" && password !== repeat) {
      setError("Die Passwörter stimmen nicht überein.")
      return
    }
    setBusy(true)
    try {
      const session = mode === "create" ? await signUp(name, password) : await signIn(name, password)
      onSignedIn(session)
    } catch (err) {
      const message = err instanceof CloudError ? err.message : "Anmeldung fehlgeschlagen."
      setError(err instanceof CloudError && err.kind === "offline" ? "Keine Verbindung – zum Anmelden braucht filmio Internet." : message)
      // Gibt es den Account inzwischen (z.B. auf einem anderen Gerät erstellt), zur Anmeldung wechseln.
      if (mode === "create" && /schon einen Account/.test(message)) setMode("login")
      setBusy(false)
    }
  }

  const creating = mode === "create"

  return (
    <div className="login">
      <div className="login-card">
        <h1 className="login-logo logo">filmio</h1>

        {mode === "loading" && <p className="login-wait" aria-live="polite">Verbinde …</p>}

        {mode === "unreachable" && (
          <div className="login-form">
            <p className="notice notice-error" role="alert">Keine Verbindung – zum Anmelden braucht filmio Internet.</p>
            <button type="button" className="btn btn-primary btn-block" onClick={retry}>Erneut versuchen</button>
          </div>
        )}

        {(mode === "create" || mode === "login") && (
          <form className="login-form" onSubmit={submit} noValidate>
            <h2 className="login-title">{creating ? "Account erstellen" : "Anmelden"}</h2>
            <label className="login-field">
              <span className="vh">Name</span>
              <input
                type="text"
                name="username"
                autoComplete="username"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                placeholder="Name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </label>
            <label className="login-field">
              <span className="vh">Passwort</span>
              <input
                type="password"
                name="password"
                autoComplete={creating ? "new-password" : "current-password"}
                placeholder="Passwort"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </label>
            {creating && (
              <label className="login-field">
                <span className="vh">Passwort wiederholen</span>
                <input
                  type="password"
                  name="password-repeat"
                  autoComplete="new-password"
                  placeholder="Passwort wiederholen"
                  value={repeat}
                  onChange={(e) => setRepeat(e.target.value)}
                  required
                />
              </label>
            )}
            {error && <p className="notice notice-error login-error" role="alert">{error}</p>}
            <button type="submit" className="btn btn-primary btn-block" disabled={busy || !name.trim() || !password}>
              {busy ? (creating ? "Erstelle …" : "Melde an …") : (creating ? "Account erstellen" : "Anmelden")}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
