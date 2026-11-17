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

/** Erklärung zu jeder Frage (gleiche Reihenfolge) – hinter dem „i“ im Fragebogen. */
export const QUESTION_HELP: string[] = [
  "Hast du kaum auf die Uhr oder aufs Handy geschaut? Ja, wenn sich der Film kürzer angefühlt hat, als er war – Nein, wenn er sich gezogen hat.",
  "Gab es Durchhänger, in denen du gedanklich woanders warst? Ja = keine, Neutral = ein, zwei zähe Stellen, Nein = du bist öfter abgeschweift.",
  "Hast du Sofa, Kinosaal und Handy vergessen und warst richtig in der Welt des Films? Neutral, wenn nur zeitweise.",
  "Waren dir die Hauptfiguren wichtig – hast du gehofft, dass es für sie gut ausgeht? Nein, wenn sie dir egal waren.",
  "Hat der Film ein echtes Gefühl ausgelöst – lautes Lachen, Tränen, Gänsehaut oder Anspannung? Welches, ist egal, Hauptsache spürbar.",
  "Gibt es eine Szene, ein Bild oder eine Wendung, an die du dich noch lange erinnern wirst?",
  "Hast du danach noch über den Film nachgedacht, darüber geredet oder Erklärungen und Hintergründe gesucht?",
  "Vergleich mit deiner Erwartung vorher: Ja = positiv überrascht, Neutral = genau so gut wie gedacht, Nein = enttäuscht.",
  "Nimmst du etwas mit – einen Gedanken, eine neue Sicht auf etwas oder einfach einen Abend, der sich richtig gelohnt hat?",
  "Würdest du sitzen bleiben, wenn jetzt direkt ein zweiter Teil starten würde? Ja, wenn du mehr von dieser Welt und den Figuren willst.",
  "Bilder, Kamera, Farben, Effekte, Kulissen: Ist dir das positiv aufgefallen? Neutral, wenn es ordentlich, aber unauffällig war.",
  "Musik, Soundtrack, Geräusche: Haben sie die Stimmung getragen oder hast du sie noch im Ohr? Neutral, wenn sie dir nicht weiter aufgefallen sind.",
  "Hat das Ende gepasst und dich zufrieden zurückgelassen? Auch ein offenes Ende kann Ja sein. Nein, wenn es dich geärgert hat oder überhastet war.",
  "Würdest du den Film von dir aus jemandem empfehlen – nicht nur, wenn dich jemand fragt?",
  "Würdest du ihn dir irgendwann wieder ansehen, zum Beispiel mit jemandem, der ihn noch nicht kennt?",
]

// Ja = 1, Neutral = 0.5, Nein = 0.
// Sterne = runde( Punkte / 15 * 5 auf nächste 0.5 ), min 0.5, max 5.0
export function scoreFromAnswers(answers: Answer[]): number {
  const points = answers.reduce(
    (s, a) => s + (a === "ja" ? 1 : a === "neutral" ? 0.5 : 0), 0)
  const raw = (points / QUESTIONS.length) * 5
  return Math.min(5, Math.max(0.5, Math.round(raw * 2) / 2))
}
