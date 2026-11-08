// Which piece/card skin is active. One provider at the app root; every
// visual goes through <Piece> / <CardIcon> (skins/Piece.jsx), which read it
// from here. Persisted per browser for now — a shop/account later only has
// to call setPieceSkin / setCardSkin with an owned skin id.
import { createContext, useContext, useMemo, useState } from 'react'
import { PIECE_SKINS, DEFAULT_PIECE_SKIN } from './pieces/index.jsx'
import { CARD_SKINS, DEFAULT_CARD_SKIN } from './cards/index.jsx'

const PIECE_KEY = 'chessplus_piece_skin'
const CARD_KEY = 'chessplus_card_skin'

function load(key, registry, fallback) {
  try {
    const v = localStorage.getItem(key)
    return v && registry[v] ? v : fallback
  } catch { return fallback }
}
function save(key, v) {
  try { localStorage.setItem(key, v) } catch { /* not persisted */ }
}

const SkinCtx = createContext({ pieceSkin: DEFAULT_PIECE_SKIN, cardSkin: DEFAULT_CARD_SKIN, setPieceSkin() {}, setCardSkin() {} })

export function SkinProvider({ children }) {
  const [pieceSkin, setPiece] = useState(() => load(PIECE_KEY, PIECE_SKINS, DEFAULT_PIECE_SKIN))
  const [cardSkin, setCard] = useState(() => load(CARD_KEY, CARD_SKINS, DEFAULT_CARD_SKIN))
  const value = useMemo(() => ({
    pieceSkin,
    cardSkin,
    setPieceSkin: id => { if (PIECE_SKINS[id]) { setPiece(id); save(PIECE_KEY, id) } },
    setCardSkin: id => { if (CARD_SKINS[id]) { setCard(id); save(CARD_KEY, id) } },
  }), [pieceSkin, cardSkin])
  return <SkinCtx.Provider value={value}>{children}</SkinCtx.Provider>
}

export function useSkins() {
  return useContext(SkinCtx)
}
