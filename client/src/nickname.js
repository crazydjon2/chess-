const STORAGE_KEY = 'chessplus_nickname'

const ADJECTIVES = ['Быстрый', 'Хитрый', 'Смелый', 'Тихий', 'Грозный', 'Ловкий', 'Стальной', 'Дерзкий']
const NOUNS = ['Конь', 'Слон', 'Ладья', 'Ферзь', 'Пешка', 'Стратег', 'Игрок', 'Тактик']

function generateDefaultNickname() {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)]
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)]
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
