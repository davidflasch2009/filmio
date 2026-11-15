import { IconChevronDown } from "./Icons"

interface Props<T extends string | number> {
  id: string
  label: string
  options: { value: T; label: string }[]
  value: T
  onChange: (value: T) => void
  /** Hervorgehoben, wenn vom Standard abweichend. */
  active: boolean
  /** Text im Ruhezustand (z.B. „Genre“ statt „Alle Genres“). */
  idleLabel?: string
}

/** Runder Filter-Chip; ein unsichtbares <select> darüber öffnet die native Auswahl. */
export default function FilterChip<T extends string | number>({ id, label, options, value, onChange, active, idleLabel }: Props<T>) {
  const current = options.find((o) => o.value === value)?.label ?? options[0]?.label ?? ""
  const text = active || !idleLabel ? current : idleLabel
  return (
    <label className={`chip${active ? " chip-active" : ""}`}>
      <span className="chip-text">{text}</span>
      <IconChevronDown />
      <select
        id={id}
        aria-label={label}
        value={String(value)}
        onChange={(e) => {
          const hit = options.find((o) => String(o.value) === e.target.value)
          if (hit) onChange(hit.value)
          // iOS lässt das Auswahlfeld sonst fokussiert (und damit markiert) stehen.
          e.currentTarget.blur()
        }}
      >
        {options.map((o) => <option key={String(o.value)} value={String(o.value)}>{o.label}</option>)}
      </select>
    </label>
  )
}
