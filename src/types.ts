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
  backdropPath?: string | null    // Szenenbild für die Detailseite; fehlt = noch nicht von TMDB geholt
  updatedAt?: string              // ISO-Datum der letzten eigenen Änderung (für den Abgleich zwischen Geräten)
}

export interface Store {
  version: 1
  films: Film[]
  /** Gelöschte Filme (tmdbId → ISO-Datum), damit das Löschen auch auf den anderen Geräten ankommt. */
  deleted?: Record<string, string>
}

/** Die von TMDB übernommenen (gecachten) Felder eines Films. */
export type FilmInfo = Pick<Film, "tmdbId" | "title" | "year" | "posterPath" | "backdropPath" | "genres" | "overview" | "runtime">
