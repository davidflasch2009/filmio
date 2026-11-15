---
id: T3
titel: Datenschema & Export/Import-Format
typ: domain-modeling
modus: HITL
status: offen
blockiert_von: [T2]
---

## Question

Datenmodell + Speicher + Export/Import-Format.

- **Felder eines Film-Eintrags:** TMDB-ID, Titel, Jahr, Poster-Pfad, Status (gesehen|watchlist), Bewertung (berechnet), Fragebogen-Antworten?, Notiz/Review, hinzugefügt-am, gesehen-am, Genres.
- **localStorage-Struktur:** ein Array? nach Status getrennt? Schema-Versionsfeld?
- **Export/Import-JSON:** Format, Validierung, Merge vs. Überschreiben beim Import. (David will „perfektes Export/Import".)

Blockiert von T2, weil die Antwort-Speicherung vom Fragebogen-Design abhängt.
