import ru from './locales/ru.js'
import en from './locales/en.js'
import uk from './locales/uk.js'
import es from './locales/es.js'
import pt from './locales/pt.js'
import fr from './locales/fr.js'
import de from './locales/de.js'
import it from './locales/it.js'
import pl from './locales/pl.js'
import tr from './locales/tr.js'
import zh from './locales/zh.js'
import ja from './locales/ja.js'
import ko from './locales/ko.js'

// Tiny dependency-free i18n.
//   t(key, vars)      — '{name}' placeholders filled from vars
//   tn(key, n, vars)  — plural entry ({ one, few, many, other }) picked via Intl.PluralRules
//   tParts(key, vars) — like t, but vars may be React nodes; returns an array to render
//   tErr(msg)         — error key from server/engines → text; unknown strings pass through
//   playerName(p)     — player's nickname, or a localized name for a bot seat
// App.jsx subscribes via useLang() (index.js), so a language switch re-renders the tree.
// Kept React-free: server/ and tools/ import cards.js/economy.js, which use t().

const DICTS = { ru, en, uk, es, pt, fr, de, it, pl, tr, zh, ja, ko }

export const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'ru', label: 'Русский' },
  { code: 'uk', label: 'Українська' },
  { code: 'es', label: 'Español' },
  { code: 'pt', label: 'Português' },
  { code: 'fr', label: 'Français' },
  { code: 'de', label: 'Deutsch' },
  { code: 'it', label: 'Italiano' },
  { code: 'pl', label: 'Polski' },
  { code: 'tr', label: 'Türkçe' },
  { code: 'zh', label: '中文' },
  { code: 'ja', label: '日本語' },
  { code: 'ko', label: '한국어' },
]

const STORAGE_KEY = 'chessplus_lang'

function detect() {
  // Server / Node tools (balance lab): stay on the source language.
  if (typeof window === 'undefined') return 'ru'
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved && DICTS[saved]) return saved
  } catch {
    // localStorage unavailable — fall through to the browser language.
  }
  const prefs = typeof navigator !== 'undefined' ? (navigator.languages ?? [navigator.language]) : []
  for (const p of prefs) {
    const code = String(p || '').toLowerCase().split('-')[0]
    if (DICTS[code]) return code
  }
  return 'en'
}

let lang = detect()
const listeners = new Set()

function applyDocumentLang() {
  if (typeof document !== 'undefined') document.documentElement.lang = lang
}
applyDocumentLang()

export function getLang() { return lang }

export function setLang(code) {
  if (!DICTS[code] || code === lang) return
  lang = code
  try { localStorage.setItem(STORAGE_KEY, code) } catch { /* not persisted */ }
  applyDocumentLang()
  listeners.forEach(fn => fn())
}

export function subscribe(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

function lookup(key) {
  return DICTS[lang][key] ?? en[key] ?? ru[key]
}

function fill(str, vars) {
  if (!vars) return str
  return str.replace(/\{(\w+)\}/g, (m, name) => (name in vars ? String(vars[name]) : m))
}

export function t(key, vars) {
  const v = lookup(key)
  if (v == null) return key
  if (typeof v === 'object') return fill(v.other ?? Object.values(v)[0], vars)
  return fill(v, vars)
}

const pluralRules = {}
function pluralCategory(n) {
  pluralRules[lang] ??= new Intl.PluralRules(lang)
  return pluralRules[lang].select(n)
}

export function tn(key, n, vars) {
  const v = lookup(key)
  if (v == null) return key
  const all = { n, ...vars }
  if (typeof v === 'string') return fill(v, all)
  const form = v[pluralCategory(n)] ?? v.other ?? v.many ?? Object.values(v)[0]
  return fill(form, all)
}

export function tParts(key, vars) {
  const str = t(key)
  const out = []
  let last = 0
  str.replace(/\{(\w+)\}/g, (m, name, idx) => {
    if (idx > last) out.push(str.slice(last, idx))
    out.push(vars && name in vars ? vars[name] : m)
    last = idx + m.length
    return m
  })
  if (last < str.length) out.push(str.slice(last))
  return out
}

// Server and engines report errors as keys ('err.notYourTurn'); anything
// that isn't a known key (e.g. an unexpected exception text) shows as is.
export function tErr(msg) {
  return typeof msg === 'string' && lookup(msg) != null ? t(msg) : msg
}

// Bot seats carry botLevel instead of a name — localized "AI · <level>".
export function playerName(p) {
  if (!p) return undefined
  if (p.botLevel) return t('bot.name', { level: t('bot.' + p.botLevel) })
  return p.name
}
