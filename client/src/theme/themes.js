// HUD themes. The default look lives in tokens.css; a theme here is a
// partial override — { '--c-accent': '#…', … } — applied on <html>, so any
// token can be re-skinned without touching component CSS. A bought HUD
// later = one more entry (or one loaded from the server) + applyTheme(id).
export const THEMES = {
  default: { id: 'default', vars: {} },
}

const STORAGE_KEY = 'chessplus_hud_theme'
let applied = []

export function applyTheme(id) {
  const theme = THEMES[id] ?? THEMES.default
  if (typeof document === 'undefined') return theme.id
  const root = document.documentElement
  applied.forEach(name => root.style.removeProperty(name))
  applied = Object.keys(theme.vars)
  Object.entries(theme.vars).forEach(([name, value]) => root.style.setProperty(name, value))
  root.dataset.hud = theme.id
  window.dispatchEvent(new Event('chessplus:theme'))
  try { localStorage.setItem(STORAGE_KEY, theme.id) } catch { /* not persisted */ }
  return theme.id
}

export function savedThemeId() {
  try { return localStorage.getItem(STORAGE_KEY) || 'default' } catch { return 'default' }
}
