/**
 * Spindle's icon set.
 *
 * Original drawings — simple 16px stroke icons drawn for this project.
 * Not derived from any other application's assets.
 */

import type { SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement> & { size?: number }

function Icon({ size = 16, children, ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      {children}
    </svg>
  )
}

export const IconFiles = (p: IconProps) => (
  <Icon {...p}>
    <path d="M2 3.5A1.5 1.5 0 0 1 3.5 2h3l1.5 2H12.5A1.5 1.5 0 0 1 14 5.5v7A1.5 1.5 0 0 1 12.5 14h-9A1.5 1.5 0 0 1 2 12.5z" />
  </Icon>
)

export const IconFile = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 2h5l3 3v9H4z" />
    <path d="M9 2v3h3" />
  </Icon>
)

export const IconFolder = (p: IconProps) => (
  <Icon {...p}>
    <path d="M2 4.5A1.5 1.5 0 0 1 3.5 3h2.4l1.3 1.6h5.3A1.5 1.5 0 0 1 14 6.1v6.4a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 12.5z" />
  </Icon>
)

export const IconFolderOpen = (p: IconProps) => (
  <Icon {...p}>
    <path d="M2 12.5v-8A1.5 1.5 0 0 1 3.5 3h2.4l1.3 1.6h5.3A1.5 1.5 0 0 1 14 6.1v1.4" />
    <path d="M2 12.5 3.6 8h12.2l-1.7 4.5H2.6A1.5 1.5 0 0 1 1 11z" />
  </Icon>
)

export const IconSearch = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="7" cy="7" r="4.2" />
    <path d="m10.2 10.2 3 3" />
  </Icon>
)

export const IconTag = (p: IconProps) => (
  <Icon {...p}>
    <path d="M2.5 7V3.5A1 1 0 0 1 3.5 2.5H7l6.5 6.5a1.2 1.2 0 0 1 0 1.7l-4.3 4.3a1.2 1.2 0 0 1-1.7 0z" />
    <circle cx="5.2" cy="5.2" r="0.9" fill="currentColor" stroke="none" />
  </Icon>
)

export const IconGraph = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="8" cy="3.4" r="1.9" />
    <circle cx="3.2" cy="12" r="1.9" />
    <circle cx="12.8" cy="12" r="1.9" />
    <path d="M8 5.3 4.2 10.3M8 5.3l3.8 5M5.1 12h5.8" />
  </Icon>
)

export const IconBacklinks = (p: IconProps) => (
  <Icon {...p}>
    <path d="M6.5 9.5 3 6l3.5-3.5" />
    <path d="M3 6h6.2A4 4 0 0 1 13 10v1.5" />
  </Icon>
)

export const IconOutgoing = (p: IconProps) => (
  <Icon {...p}>
    <path d="M9.5 6.5 13 3" />
    <path d="M13 3H9.2M13 3v3.8" />
    <path d="M6.5 9.5 3 13" />
    <path d="M3 10.2V13h2.8" />
  </Icon>
)

export const IconOutline = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3 4h10M3 8h10M3 12h6" />
  </Icon>
)

export const IconCalendar = (p: IconProps) => (
  <Icon {...p}>
    <rect x="2.5" y="3.5" width="11" height="10" rx="1.5" />
    <path d="M2.5 6.5h11M5.5 2v3M10.5 2v3" />
  </Icon>
)

export const IconCommand = (p: IconProps) => (
  <Icon {...p}>
    <path d="M6 4.5A1.75 1.75 0 1 0 4.25 2.75h7.5A1.75 1.75 0 1 0 10 4.5v7A1.75 1.75 0 1 0 11.75 13h-7.5A1.75 1.75 0 1 0 6 11.5z" />
  </Icon>
)

export const IconPlus = (p: IconProps) => (
  <Icon {...p}>
    <path d="M8 3.5v9M3.5 8h9" />
  </Icon>
)

export const IconX = (p: IconProps) => (
  <Icon {...p}>
    <path d="m4 4 8 8M12 4l-8 8" />
  </Icon>
)

export const IconChevronRight = (p: IconProps) => (
  <Icon {...p}>
    <path d="m6 3.5 4.5 4.5L6 12.5" />
  </Icon>
)

export const IconPencil = (p: IconProps) => (
  <Icon {...p}>
    <path d="M11.2 2.6a1.5 1.5 0 0 1 2.1 2.1L5.6 12.4 2.5 13.5l1.1-3.1z" />
  </Icon>
)

export const IconTrash = (p: IconProps) => (
  <Icon {...p}>
    <path d="M2.8 4.5h10.4M6 4.5V3.2A1.2 1.2 0 0 1 7.2 2h1.6A1.2 1.2 0 0 1 10 3.2v1.3" />
    <path d="M4 4.5 4.7 13a1.2 1.2 0 0 0 1.2 1.1h4.2a1.2 1.2 0 0 0 1.2-1.1l.7-8.5" />
  </Icon>
)

export const IconSun = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="8" cy="8" r="3" />
    <path d="M8 1.5v1.2M8 13.3v1.2M1.5 8h1.2M13.3 8h1.2M3.4 3.4l.9.9M11.7 11.7l.9.9M12.6 3.4l-.9.9M4.3 11.7l-.9.9" />
  </Icon>
)

export const IconMoon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M13 9.8A5.8 5.8 0 0 1 6.2 3a5.8 5.8 0 1 0 6.8 6.8z" />
  </Icon>
)

export const IconSplit = (p: IconProps) => (
  <Icon {...p}>
    <rect x="2" y="2.5" width="12" height="11" rx="1.5" />
    <path d="M8 2.5v11" />
  </Icon>
)

export const IconSettings = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="8" cy="8" r="2.2" />
    <path d="M8 1.8v1.4M8 12.8v1.4M14.2 8h-1.4M3.2 8H1.8M12.4 3.6l-1 1M4.6 11.4l-1 1M12.4 12.4l-1-1M4.6 4.6l-1-1" />
  </Icon>
)

export const IconBookOpen = (p: IconProps) => (
  <Icon {...p}>
    <path d="M2.5 3.2h4a2 2 0 0 1 2 2v8a1.6 1.6 0 0 0-1.6-1.6H2.5z" />
    <path d="M13.5 3.2h-4a2 2 0 0 0-2 2v8a1.6 1.6 0 0 1 1.6-1.6h4.4z" />
  </Icon>
)

export const IconCode = (p: IconProps) => (
  <Icon {...p}>
    <path d="m5.5 4.5-3 3.5 3 3.5M10.5 4.5l3 3.5-3 3.5" />
  </Icon>
)

export const IconFilter = (p: IconProps) => (
  <Icon {...p}>
    <path d="M2.5 3.5h11l-4.2 5v4.5l-2.6 1V8.5z" />
  </Icon>
)

export const IconZoomIn = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="7" cy="7" r="4.2" />
    <path d="m10.2 10.2 3 3M5 7h4M7 5v4" />
  </Icon>
)

export const IconZoomOut = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="7" cy="7" r="4.2" />
    <path d="m10.2 10.2 3 3M5 7h4" />
  </Icon>
)

export const IconRefresh = (p: IconProps) => (
  <Icon {...p}>
    <path d="M13 8a5 5 0 1 1-1.6-3.7" />
    <path d="M13.2 2.5V5h-2.5" />
  </Icon>
)

export const IconFit = (p: IconProps) => (
  <Icon {...p}>
    <path d="M2.5 6V2.5H6M10 2.5h3.5V6M13.5 10v3.5H10M6 13.5H2.5V10" />
  </Icon>
)

export const IconCentre = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="8" cy="8" r="3" />
    <path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2" />
  </Icon>
)

export const IconPin = (p: IconProps) => (
  <Icon {...p}>
    <path d="M9.5 1.8 14.2 6.5l-2.4.6-2.6 2.6.6 2.4-1.1 1.1-3.4-3.4-3.4 3.4-1.1-1.1 3.4-3.4L.8 3.3l1.1-1.1 2.4.6 2.6-2.6z" />
  </Icon>
)
