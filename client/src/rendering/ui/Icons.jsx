import { MENU_ICON_SVG } from './menuIcons'
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
  return <svg className="ic ic-help mi-svg" width={size} height={size} viewBox="0 0 48 48" aria-hidden="true" dangerouslySetInnerHTML={{ __html: MENU_ICON_SVG.help }} />
}
export function IconMegaphone({ size = 22 }) {
  return <svg className="ic ic-megaphone mi-svg" width={size} height={size} viewBox="0 0 48 48" aria-hidden="true" dangerouslySetInnerHTML={{ __html: MENU_ICON_SVG.megaphone }} />
}
export function IconMail({ size = 22 }) {
  return <svg className="ic ic-mail mi-svg" width={size} height={size} viewBox="0 0 48 48" aria-hidden="true" dangerouslySetInnerHTML={{ __html: MENU_ICON_SVG.mail }} />
}
export function IconPalette({ size = 22 }) {
  return <svg className="ic ic-palette mi-svg" width={size} height={size} viewBox="0 0 48 48" aria-hidden="true" dangerouslySetInnerHTML={{ __html: MENU_ICON_SVG.palette }} />
}
export function IconRobot({ size = 44 }) {
  return <svg className="ic ic-robot mi-svg" width={size} height={size} viewBox="0 0 48 48" aria-hidden="true" dangerouslySetInnerHTML={{ __html: MENU_ICON_SVG.robot }} />
}
export function IconFlask({ size = 44 }) {
  return <svg className="ic ic-flask mi-svg" width={size} height={size} viewBox="0 0 48 48" aria-hidden="true" dangerouslySetInnerHTML={{ __html: MENU_ICON_SVG.flask }} />
}
export function IconCrown({ size = 30 }) {
  return <svg className="ic ic-crown" width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5L3 8z" /></svg>
}
