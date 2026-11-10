import { useEffect, useState } from 'react'
import { getLang } from './i18n/core.js'

const STORAGE_KEY = 'chessplus_nickname'

const ADJECTIVES = ['Быстрый', 'Хитрый', 'Смелый', 'Тихий', 'Грозный', 'Ловкий', 'Стальной', 'Дерзкий']
const NOUNS = ['Конь', 'Слон', 'Ладья', 'Ферзь', 'Пешка', 'Стратег', 'Игрок', 'Тактик']
// Everyone else gets Latin-script defaults, readable by any opponent.
const ADJECTIVES_EN = ['Swift', 'Sly', 'Bold', 'Quiet', 'Grim', 'Nimble', 'Steel', 'Daring']
const NOUNS_EN = ['Knight', 'Bishop', 'Rook', 'Queen', 'Pawn', 'Strategist', 'Player', 'Tactician']

function generateDefaultNickname() {
  const cyrillic = ['ru', 'uk'].includes(getLang())
  const adjs = cyrillic ? ADJECTIVES : ADJECTIVES_EN
  const nouns = cyrillic ? NOUNS : NOUNS_EN
  const adj = adjs[Math.floor(Math.random() * adjs.length)]
  const noun = nouns[Math.floor(Math.random() * nouns.length)]
  const num = Math.floor(10 + Math.random() * 90)
  return `${adj}${noun}${num}`
}

// Reads the saved nickname from localStorage, generating and persisting a
// random default the first time (so there's always something sensible to
// show/send, without forcing the player through a setup step).
export function loadNickname() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) return saved
  } catch {
    // localStorage unavailable (privacy mode, etc.) — fall through to an
    // unpersisted default for this session.
  }
  const generated = generateDefaultNickname()
  saveNickname(generated)
  return generated
}

export function saveNickname(name) {
  try {
    localStorage.setItem(STORAGE_KEY, name)
  } catch {
    // Ignore — nickname just won't survive a reload in this environment.
  }
}

// One nickname for the whole app: a rename anywhere (menu, lobby) updates
// every mounted useNickname() through this event.
const EVENT = 'chessplus:nickname'
export function setNickname(name) {
  saveNickname(name)
  window.dispatchEvent(new CustomEvent(EVENT, { detail: name }))
}
export function useNickname() {
  const [name, setName] = useState(loadNickname)
  useEffect(() => {
    const on = e => setName(e.detail)
    window.addEventListener(EVENT, on)
    return () => window.removeEventListener(EVENT, on)
  }, [])
  return [name, setNickname]
}
