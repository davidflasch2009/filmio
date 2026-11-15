---
id: T6
titel: Deployment & Repo-Setup
typ: task
modus: HITL/AFK
status: geschlossen
blockiert_von: []
---

## Question

Deployment auf GitHub Pages.

## Antwort

- **Repo:** `filmio`, **public** (nötig für Gratis-Pages).
- **Vite:** `base: '/filmio/'`.
- **Kein Router** (Views über State) → kein SPA-404-Problem.
- **Deploy:** **GitHub Actions** bei Push auf `main` → Build → `actions/deploy-pages`. Pages-Quelle in den Repo-Settings auf „GitHub Actions" stellen.
- **TMDB-Token:** als Repo-**Secret** `VITE_TMDB_TOKEN`, im Workflow als Env injiziert. Bleibt im Bundle sichtbar → **Wegwerf-/Non-Commercial-Key**. `.env` lokal, via `.gitignore` nicht committen.
