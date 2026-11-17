import { useEffect, useState } from "react"
import { currentSubscription, disablePush, enablePush, PushDenied, pushSupport, registerSubscription, testPush } from "../lib/push"
import { IconBell } from "./Icons"

interface Props {
  region: string
  hasServices: boolean
  onOpenServices: () => void
}

type Status = "loading" | "off" | "on" | "denied"

/** Mitteilungen: wenn ein Watchlist-Film bei meinen Diensten läuft oder ins Kino kommt. */
export default function NotificationSettings({ region, hasServices, onOpenServices }: Props) {
  const [support] = useState(pushSupport)
  const [status, setStatus] = useState<Status>(() => (support === "ok" ? "loading" : "off"))
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null)

  // Stand auf diesem Gerät lesen – und den Server-Eintrag auffrischen (Land, falls er verloren ging).
  useEffect(() => {
    if (support !== "ok") return
    let cancelled = false
    void (async () => {
      const sub = await currentSubscription()
      if (cancelled) return
      if (sub) {
        setStatus("on")
        registerSubscription(sub, region).catch(() => {})
      } else {
        setStatus(typeof Notification !== "undefined" && Notification.permission === "denied" ? "denied" : "off")
      }
    })()
    return () => { cancelled = true }
  }, [support, region])

  async function toggle() {
    if (busy) return
    setBusy(true)
    setMessage(null)
    try {
      if (status === "on") {
        await disablePush()
        setStatus("off")
      } else {
        await enablePush(region)
        setStatus("on")
        setMessage({ kind: "ok", text: "Eingeschaltet. Tippe auf „Test-Mitteilung“, um es auszuprobieren." })
      }
    } catch (e) {
      if (e instanceof PushDenied) {
        setStatus(e.message === "denied" ? "denied" : "off")
      } else {
        setMessage({ kind: "error", text: e instanceof Error ? e.message : "Das hat nicht geklappt." })
      }
    } finally {
      setBusy(false)
    }
  }

  async function test() {
    setBusy(true)
    setMessage(null)
    try {
      await testPush()
      setMessage({ kind: "ok", text: "Test-Mitteilung ist unterwegs." })
    } catch {
      setMessage({ kind: "error", text: "Die Test-Mitteilung konnte nicht geschickt werden. Bist du online?" })
    } finally {
      setBusy(false)
    }
  }

  const on = status === "on"

  return (
    <>
      <h2 className="group-label">Mitteilungen</h2>
      <div className="group">
        <div className="group-row switch-row">
          <span className="row-icon"><IconBell /></span>
          <span className="row-text" id="push-label">
            Neues auf der Watchlist
            <span className="row-sub">Läuft ein Film bei deinen Diensten oder kommt ins Kino – einmal am Tag, gegen 17 Uhr</span>
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={on}
            aria-labelledby="push-label"
            className={`switch${on ? " switch-on" : ""}`}
            disabled={support !== "ok" || status === "loading" || status === "denied" || busy}
            onClick={() => void toggle()}
          >
            <span className="switch-knob" />
          </button>
        </div>
        {on && (
          <button type="button" className="group-row row-button" disabled={busy} onClick={() => void test()}>
            <span className="row-text push-test">Test-Mitteilung senden</span>
          </button>
        )}
      </div>
      {support === "ios-browser" && (
        <p className="group-note">Auf dem iPhone klappt das, wenn filmio auf dem Home-Bildschirm liegt: in Safari Teilen → „Zum Home-Bildschirm“, dann von dort öffnen.</p>
      )}
      {support === "unsupported" && <p className="group-note">Dieser Browser kann keine Mitteilungen empfangen.</p>}
      {status === "denied" && (
        <p className="group-note">Mitteilungen sind für filmio blockiert. Erlaube sie in den iPhone-Einstellungen unter Mitteilungen → filmio.</p>
      )}
      {on && !hasServices && (
        <p className="group-note">
          Wähle noch deine <button type="button" className="text-btn text-btn-inline" onClick={onOpenServices}>Streaming-Dienste</button> – sonst
          meldet filmio nur Kinostarts.
        </p>
      )}
      {message && (
        <p className={`notice ${message.kind === "ok" ? "notice-ok" : "notice-error"} push-message`} role={message.kind === "error" ? "alert" : "status"}>
          {message.text}
        </p>
      )}
    </>
  )
}
