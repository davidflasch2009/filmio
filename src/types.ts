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
  release?: ReleaseInfo           // Erscheinungstermine; fehlt = noch nicht von TMDB geholt
  priority?: boolean              // Watchlist: „unbedingt bald“ – steht oben
  rewatches?: string[]            // weitere Male gesehen (ISO-Datum), zusätzlich zu watchedAt
  tags?: string[]                 // eigene Listen, z.B. „Weihnachten“
}

export type RegionCode = "DE" | "AT" | "CH"

export interface ReleaseInfo {
  /** Erstveröffentlichung laut TMDB (YYYY-MM-DD), null = noch kein Termin. */
  date: string | null
  /** Start je Land: im Kino (cinema) oder direkt digital/Streaming. */
  local: Partial<Record<RegionCode, { date: string; cinema: boolean }>>
  /** TMDB führt den Film noch nicht als „erschienen“. */
  pending: boolean
  /** Zuletzt bei TMDB geprüft (ISO) – Termine kommender Filme werden regelmäßig aufgefrischt. */
  checkedAt: string
}

/** Ein gewählter Streaming-Dienst. ids: alle TMDB-Anbieter-IDs dieses Dienstes (z.B. auch „… with Ads“). */
export interface Service {
  id: number
  name: string
  logoPath: string | null
  ids: number[]
}

export interface Store {
  version: 1
  films: Film[]
  /** Gelöschte Filme (tmdbId → ISO-Datum), damit das Löschen auch auf den anderen Geräten ankommt. */
  deleted?: Record<string, string>
  /** Meine Streaming-Dienste (für alle Geräte gleich). */
  services?: { list: Service[]; updatedAt: string }
  /** Mein Kino (Cineplexx Österreich); null = keins gewählt. */
  cinema?: { value: MyCinema | null; updatedAt: string }
  /** Filmreihen, die erst ab einem bestimmten Film zählen (TMDB-Collection-ID → tmdbId), z.B. James Bond ab Casino Royale. */
  seriesStart?: { starts: Record<string, number>; updatedAt: string }
}

export interface MyCinema {
  id: string
  name: string
}

/** Die von TMDB übernommenen (gecachten) Felder eines Films. */
export type FilmInfo = Pick<Film, "tmdbId" | "title" | "year" | "posterPath" | "backdropPath" | "genres" | "overview" | "runtime" | "release">
