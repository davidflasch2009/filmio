import type { ReactNode } from "react"

interface IconProps {
  size?: number
  className?: string
}

function Svg({ children, size, className, filled = false }: IconProps & { children: ReactNode; filled?: boolean }) {
  return (
    <svg
      className={className ? `ic ${className}` : "ic"}
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill={filled ? "currentColor" : "none"}
      stroke={filled ? "none" : "currentColor"}
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  )
}

export const STAR_PATH = "M12 2.6l2.83 5.9 6.47.86-4.72 4.5 1.17 6.42L12 17.17l-5.75 3.11 1.17-6.42-4.72-4.5 6.47-.86z"

export const IconEye = (p: IconProps) => (
  <Svg {...p}><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" /><circle cx="12" cy="12" r="3" /></Svg>
)
export const IconBookmark = (p: IconProps) => <Svg {...p}><path d="M6.5 3.5h11v17l-5.5-3.8-5.5 3.8z" /></Svg>
export const IconSearch = (p: IconProps) => <Svg {...p}><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4.5 4.5" /></Svg>
export const IconMore = (p: IconProps) => (
  <Svg {...p} filled><circle cx="5.5" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="18.5" cy="12" r="1.6" /></Svg>
)
export const IconChevronLeft = (p: IconProps) => <Svg {...p}><path d="M14.5 5.5 8 12l6.5 6.5" /></Svg>
export const IconChevronDown = (p: IconProps) => <Svg {...p}><path d="m7 10 5 5 5-5" /></Svg>
export const IconChevronRight = (p: IconProps) => <Svg {...p}><path d="m9.5 5.5 6.5 6.5-6.5 6.5" /></Svg>
export const IconCheck = (p: IconProps) => <Svg {...p}><path d="m5 12.5 4.5 4.5L19 7.5" /></Svg>
export const IconMinus = (p: IconProps) => <Svg {...p}><path d="M6 12h12" /></Svg>
export const IconX = (p: IconProps) => <Svg {...p}><path d="M6.5 6.5l11 11M17.5 6.5l-11 11" /></Svg>
export const IconPlus = (p: IconProps) => <Svg {...p}><path d="M12 5.5v13M5.5 12h13" /></Svg>
export const IconTrash = (p: IconProps) => <Svg {...p}><path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13" /></Svg>
export const IconDownload = (p: IconProps) => <Svg {...p}><path d="M12 4v11m-4.5-4.5L12 15l4.5-4.5M5 19.5h14" /></Svg>
export const IconUpload = (p: IconProps) => <Svg {...p}><path d="M12 15.5V4.5M7.5 9 12 4.5 16.5 9M5 19.5h14" /></Svg>
export const IconStar = (p: IconProps) => <Svg {...p}><path d={STAR_PATH} /></Svg>
export const IconHistory = (p: IconProps) => (
  <Svg {...p}><path d="M3.8 12a8.2 8.2 0 1 0 2.4-5.8" /><path d="M3.5 4.5v3.9h3.9" /><path d="M12 7.8v4.6l3 1.9" /></Svg>
)
export const IconDice = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3.5" y="3.5" width="17" height="17" rx="4" />
    <circle cx="8.5" cy="8.5" r="1.4" fill="currentColor" stroke="none" />
    <circle cx="15.5" cy="8.5" r="1.4" fill="currentColor" stroke="none" />
    <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
    <circle cx="8.5" cy="15.5" r="1.4" fill="currentColor" stroke="none" />
    <circle cx="15.5" cy="15.5" r="1.4" fill="currentColor" stroke="none" />
  </Svg>
)
