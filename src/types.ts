export type Answer = "ja" | "neutral" | "nein"
export type Status = "watched" | "watchlist"

export interface Film {
  tmdbId: number
  title: string
  year: number | null
  posterPath: string | null       // z.B. "/abc.jpg"
  genres: string[]
  overview: string                // lokal gecached → offline sichtbar
  runtime: number | null
  status: Status
  rating: number | null           // 0.5–5.0, nur bei "watched"
  answers: Answer[] | null        // Länge 15, Reihenfolge = QUESTIONS
  note: string
  addedAt: string                 // ISO-Datum
  watchedAt: string | null        // ISO-Datum, wenn als gesehen markiert
  fromNotes: boolean              // Bewertung aus den eigenen Notizen übernommen, nicht in der App bewertet
}

export interface Store {
  version: 1
  films: Film[]
}

/** Die von TMDB übernommenen (gecachten) Felder eines Films. */
export type FilmInfo = Pick<Film, "tmdbId" | "title" | "year" | "posterPath" | "genres" | "overview" | "runtime">
