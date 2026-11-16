/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_TMDB_TOKEN?: string
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

/** Build-Zeitpunkt (ISO) und Commit – von vite.config.ts eingesetzt. */
declare const __BUILD_TIME__: string
declare const __BUILD_SHA__: string
