// Line icons used across the HUD (stroke = currentColor, so they follow
// whatever text color the token theme gives their button).
const base = { fill: 'none', stroke: 'currentColor', strokeWidth: 2.5, strokeLinecap: 'round', strokeLinejoin: 'round' }

export function IconSettings({ size = 22 }) {
  return (
    <svg className="ic ic-settings" width={size} height={size} viewBox="0 0 24 24" {...base} aria-hidden="true">
      <path d="M4 7h16M4 17h16" />
      <circle cx="9" cy="7" r="2.5" fill="var(--c-panel)" />
      <circle cx="15" cy="17" r="2.5" fill="var(--c-panel)" />
    </svg>
  )
}
export function IconBack({ size = 22 }) {
  return <svg className="ic ic-back" width={size} height={size} viewBox="0 0 24 24" {...base} strokeWidth="3" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>
}
export function IconChevron({ size = 18 }) {
  return <svg className="ic ic-chevron" width={size} height={size} viewBox="0 0 24 24" {...base} strokeWidth="3" aria-hidden="true"><path d="M9 5l7 7-7 7" /></svg>
}
export function IconDown({ size = 18, up = false }) {
  return <svg className="ic ic-down" width={size} height={size} viewBox="0 0 24 24" {...base} strokeWidth="3" aria-hidden="true"><path d={up ? 'M5 15l7-7 7 7' : 'M5 9l7 7 7-7'} /></svg>
}
export function IconClose({ size = 18 }) {
  return <svg className="ic ic-close" width={size} height={size} viewBox="0 0 24 24" {...base} strokeWidth="3" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
}
export function IconCheck({ size = 24 }) {
  return <svg className="ic ic-check" width={size} height={size} viewBox="0 0 24 24" {...base} strokeWidth="3.5" aria-hidden="true"><path d="M5 12l5 5 9-10" /></svg>
}
export function IconFlag({ size = 22 }) {
  return <svg className="ic ic-flag" width={size} height={size} viewBox="0 0 24 24" {...base} strokeWidth="2.8" aria-hidden="true"><path d="M6 21V4h10l-2 4 2 4H6" /></svg>
}
export function IconPlus({ size = 18 }) {
  return <svg className="ic ic-plus" width={size} height={size} viewBox="0 0 24 24" {...base} strokeWidth="3" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
}
export function IconRefresh({ size = 20 }) {
  return <svg className="ic ic-refresh" width={size} height={size} viewBox="0 0 24 24" {...base} strokeWidth="2.8" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.6-5.9M20 4v5h-5" /></svg>
}
export function IconKey({ size = 20 }) {
  return <svg className="ic ic-key" width={size} height={size} viewBox="0 0 24 24" {...base} strokeWidth="2.4" aria-hidden="true"><circle cx="7.5" cy="15.5" r="3.5" /><path d="M10 13l9-9M16 7l2 2M14 9l1.5 1.5" /></svg>
}
export function IconLink({ size = 20 }) {
  return <svg className="ic ic-link" width={size} height={size} viewBox="0 0 24 24" {...base} strokeWidth="2.6" aria-hidden="true"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /></svg>
}
export function IconGlobe({ size = 18 }) {
  return <svg className="ic ic-globe" width={size} height={size} viewBox="0 0 24 24" {...base} strokeWidth="2.2" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18" /></svg>
}
export function IconLock({ size = 18 }) {
  return <svg className="ic ic-lock" width={size} height={size} viewBox="0 0 24 24" {...base} strokeWidth="2.4" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>
}
export function IconList({ size = 22 }) {
  return <svg className="ic ic-list" width={size} height={size} viewBox="0 0 24 24" {...base} strokeWidth="2.6" aria-hidden="true"><path d="M9 6h11M9 12h11M9 18h11" /><circle cx="4.5" cy="6" r="1" /><circle cx="4.5" cy="12" r="1" /><circle cx="4.5" cy="18" r="1" /></svg>
}
export function IconExit({ size = 24 }) {
  return <svg className="ic ic-exit" width={size} height={size} viewBox="0 0 24 24" {...base} strokeWidth="2.6" aria-hidden="true"><path d="M14 4H6v16h8M11 12h10M17 8l4 4-4 4" /></svg>
}
export function IconHelp({ size = 22 }) {
  return <svg className="ic ic-help" width={size} height={size} viewBox="0 0 24 24" {...base} strokeWidth="2.4" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .9-1 1.7M12 17h.01" /></svg>
}
export function IconMegaphone({ size = 22 }) {
  return <svg className="ic ic-megaphone" width={size} height={size} viewBox="0 0 24 24" {...base} strokeWidth="2.4" aria-hidden="true"><path d="M4 10v4h3l7 4V6L7 10H4zM17 9a4 4 0 0 1 0 6M7 14l1 5h2" /></svg>
}
export function IconPalette({ size = 22 }) {
  return <svg className="ic ic-palette" width={size} height={size} viewBox="0 0 24 24" {...base} strokeWidth="2.4" aria-hidden="true"><path d="M12 3a9 9 0 1 0 0 18c1.5 0 2-1 2-2s-1-1.5-1-2.5S14 15 15 15h2a4 4 0 0 0 4-4c0-4.4-4-8-9-8z" /><circle cx="7.5" cy="11" r="1.2" fill="currentColor" /><circle cx="10" cy="7" r="1.2" fill="currentColor" /><circle cx="14.5" cy="7" r="1.2" fill="currentColor" /></svg>
}
export function IconRobot({ size = 44 }) {
  return (
    <svg className="ic ic-robot" width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <path d="M24 6v6" stroke="#16141F" strokeWidth="3.5" strokeLinecap="round" />
      <circle cx="24" cy="6" r="3" fill="#FFFFFF" stroke="#16141F" strokeWidth="3" />
      <rect x="9" y="13" width="30" height="27" rx="5" fill="#FFFFFF" stroke="#16141F" strokeWidth="3.5" />
      <rect x="16" y="22" width="5" height="5" fill="#16141F" />
      <rect x="27" y="22" width="5" height="5" fill="#16141F" />
      <path d="M18 33h12" stroke="#16141F" strokeWidth="3.5" strokeLinecap="round" />
    </svg>
  )
}
export function IconFlask({ size = 44 }) {
  return (
    <svg className="ic ic-flask" width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <path d="M18 6h12M20 6v12L9 38a3 3 0 0 0 3 4h24a3 3 0 0 0 3-4L28 18V6" fill="#FFFFFF" stroke="#16141F" strokeWidth="3.5" strokeLinejoin="round" strokeLinecap="round" />
      <path d="M14 30h20" stroke="#16141F" strokeWidth="3.5" strokeLinecap="round" />
    </svg>
  )
}
export function IconCrown({ size = 30 }) {
  return <svg className="ic ic-crown" width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5L3 8z" /></svg>
}
