import type { Answer } from "../types"

export const QUESTIONS: string[] = [
  "Ist die Zeit verflogen?",
  "Hat er dich durchgehend gehalten (nie abgeschweift)?",
  "Warst du ganz drin, die Welt um dich vergessen?",
  "Mit den Figuren mitgefiebert?",
  "Emotional gepackt (gelacht/geweint/gezittert)?",
  "Ein Wow-Moment, der hängenbleibt?",
  "Hat er dich nach dem Abspann noch beschäftigt?",
  "War er besser als erwartet?",
  "Hat er dir echt was gegeben (Gedanke/Erlebnis)?",
  "Hättest du sofort weitergeschaut?",
  "War die Optik ein Highlight?",
  "Hat Ton/Musik dich reingezogen?",
  "War das Ende wirklich befriedigend?",
  "Jemandem aktiv ans Herz legen?",
  "Nochmal schauen?",
]

// Ja = 1, Neutral = 0.5, Nein = 0.
// Sterne = runde( Punkte / 15 * 5 auf nächste 0.5 ), min 0.5, max 5.0
export function scoreFromAnswers(answers: Answer[]): number {
  const points = answers.reduce(
    (s, a) => s + (a === "ja" ? 1 : a === "neutral" ? 0.5 : 0), 0)
  const raw = (points / QUESTIONS.length) * 5
  return Math.min(5, Math.max(0.5, Math.round(raw * 2) / 2))
}
