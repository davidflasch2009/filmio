import { useState, type FormEvent } from "react"
import { IconPlus, IconX } from "./Icons"

interface Props {
  tags: string[]
  /** Alle vorhandenen Listen – als Vorschläge. */
  allTags: string[]
  onChange: (tags: string[]) => void
}

/** Eigene Listen eines Films: als Chips, mit „+ Liste“ zum Hinzufügen (vorhandene als Vorschläge). */
export default function TagEditor({ tags, allTags, onChange }: Props) {
  const [adding, setAdding] = useState(false)
  const [text, setText] = useState("")
  const has = (t: string) => tags.some((x) => x.toLocaleLowerCase("de") === t.toLocaleLowerCase("de"))
  const q = text.trim().toLocaleLowerCase("de")
  const suggestions = allTags.filter((t) => !has(t) && (!q || t.toLocaleLowerCase("de").includes(q))).slice(0, 8)

  function add(t: string) {
    const name = t.trim()
    if (name && !has(name)) {
      // Vorhandene Schreibweise übernehmen („weihnachten“ → „Weihnachten“).
      onChange([...tags, allTags.find((x) => x.toLocaleLowerCase("de") === name.toLocaleLowerCase("de")) ?? name])
    }
    setText("")
    setAdding(false)
  }

  function submit(e: FormEvent) {
    e.preventDefault()
    if (text.trim()) add(text)
    else setAdding(false)
  }

  return (
    <div className="tags">
      <ul className="tag-list">
        {tags.map((t) => (
          <li key={t} className="tag">
            <span>{t}</span>
            <button type="button" className="tag-remove" aria-label={`Aus „${t}“ entfernen`} onClick={() => onChange(tags.filter((x) => x !== t))}>
              <IconX />
            </button>
          </li>
        ))}
        {!adding && (
          <li>
            <button type="button" className="tag tag-add" onClick={() => setAdding(true)}><IconPlus />Liste</button>
          </li>
        )}
      </ul>
      {adding && (
        <form className="tag-form" onSubmit={submit}>
          <input
            className="tag-input"
            aria-label="Name der Liste"
            placeholder="Neue Liste, z.B. Weihnachten"
            value={text}
            maxLength={40}
            autoFocus
            enterKeyHint="done"
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Escape") { setAdding(false); setText("") } }}
          />
          <button type="submit" className="btn btn-small btn-primary" disabled={!text.trim()}>Hinzufügen</button>
          <button type="button" className="text-btn" onClick={() => { setAdding(false); setText("") }}>Abbrechen</button>
          {suggestions.length > 0 && (
            <div className="tag-suggestions">
              {suggestions.map((t) => (
                <button key={t} type="button" className="tag tag-suggestion" onClick={() => add(t)}>{t}</button>
              ))}
            </div>
          )}
        </form>
      )}
    </div>
  )
}
