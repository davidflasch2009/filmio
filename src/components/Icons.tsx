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
export const IconPlay = (p: IconProps) => <Svg {...p} filled><path d="M8 5.2v13.6a.7.7 0 0 0 1.07.6l10.6-6.8a.7.7 0 0 0 0-1.2L9.07 4.6A.7.7 0 0 0 8 5.2Z" /></Svg>
export const IconChart = (p: IconProps) => <Svg {...p}><path d="M5 20V11M12 20V4M19 20v-6" /></Svg>
export const IconNote = (p: IconProps) => (
  <Svg {...p}><path d="M6 3.5h8.5L19 8v12.5H6z" /><path d="M14.5 3.5V8H19" /><path d="M9 12.5h7M9 16h5" /></Svg>
)
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
export const IconUser = (p: IconProps) => (
  <Svg {...p}><circle cx="12" cy="8.5" r="3.6" /><path d="M5 19.5c1.2-3.3 3.9-5 7-5s5.8 1.7 7 5" /></Svg>
)
export const IconSync = (p: IconProps) => (
  <Svg {...p}><path d="M19 12a7 7 0 0 1-12.2 4.7M5 12a7 7 0 0 1 12.2-4.7" /><path d="M17.5 3.8v3.9h-3.9M6.5 20.2v-3.9h3.9" /></Svg>
)
export const IconLogout = (p: IconProps) => (
  <Svg {...p}><path d="M14 4.5H7.5a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2H14" /><path d="M11 12h9m-3-3.5 3.5 3.5-3.5 3.5" /></Svg>
)
export const IconFlag = (p: IconProps) => (
  <Svg {...p}><path d="M6 21V4.5" /><path d="M6 4.5h10.5l-2 4 2 4H6" /></Svg>
)
export const IconFlagFilled = (p: IconProps) => (
  <Svg {...p}><path d="M6 21V4.5" /><path d="M6 4.5h10.5l-2 4 2 4H6z" fill="currentColor" /></Svg>
)
export const IconTv = (p: IconProps) => (
  <Svg {...p}><rect x="3.5" y="5.5" width="17" height="11.5" rx="2" /><path d="M8.5 20h7" /></Svg>
)
export const IconRepeat = (p: IconProps) => (
  <Svg {...p}><path d="M17 3.5 20 6.5l-3 3" /><path d="M4 11.5v-1a4 4 0 0 1 4-4h12" /><path d="m7 20.5-3-3 3-3" /><path d="M20 12.5v1a4 4 0 0 1-4 4H4" /></Svg>
)
export const IconCalendar = (p: IconProps) => (
  <Svg {...p}><rect x="4" y="5.5" width="16" height="14.5" rx="2.5" /><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4" /></Svg>
)
