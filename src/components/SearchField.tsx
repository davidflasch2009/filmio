import { useRef } from "react"
import { IconSearch } from "./Icons"

interface Props {
  value: string
  onChange: (value: string) => void
  placeholder: string
  ariaLabel: string
  disabled?: boolean
}

/** Suchfeld im iOS-Stil mit Lupe und einem x zum Löschen der Eingabe. */
export default function SearchField({ value, onChange, placeholder, ariaLabel, disabled = false }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  return (
    <div className="search-field" onClick={() => inputRef.current?.focus()}>
      <IconSearch />
      <input
        ref={inputRef}
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel}
        enterKeyHint="search"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        disabled={disabled}
      />
      {value !== "" && !disabled && (
        <button
          type="button"
          className="search-clear"
          aria-label="Eingabe löschen"
          onClick={(e) => {
            e.stopPropagation()
            onChange("")
            inputRef.current?.focus()
          }}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="12" r="9" />
            <path d="M9.2 9.2l5.6 5.6M14.8 9.2l-5.6 5.6" />
          </svg>
        </button>
      )}
    </div>
  )
}
