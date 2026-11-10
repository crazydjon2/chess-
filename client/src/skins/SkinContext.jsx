// Which piece/card skin is active. One provider at the app root; every
// visual goes through <Piece> / <CardIcon> (skins/Piece.jsx), which read it
// from here. Persisted per browser for now — a shop/account later only has
// to call setPieceSkin / setCardSkin with an owned skin id.
import { createContext, useContext, useMemo, useState } from 'react'
import { useEffect } from 'react'
import { PIECE_SKINS, DEFAULT_PIECE_SKIN, preloadPieceSkin } from './pieces/index.jsx'
import { CARD_SKINS, DEFAULT_CARD_SKIN } from './cards/index.jsx'

const PIECE_KEY = 'chessplus_piece_skin'
const CARD_KEY = 'chessplus_card_skin'
const BOARD_KEY = 'chessplus_board_skin'
// Board looks: how squares + frame are drawn (rendering/board). Colours are
// tokens; a board skin may also override them (board.css [data-board=…]).
export const BOARD_SKINS = { classic: { id: 'classic' } }
export const DEFAULT_BOARD_SKIN = 'classic'

function load(key, registry, fallback) {
  try {
    const v = localStorage.getItem(key)
    return v && registry[v] ? v : fallback
  } catch { return fallback }
}
function save(key, v) {
  try { localStorage.setItem(key, v) } catch { /* not persisted */ }
}

const SkinCtx = createContext({ pieceSkin: DEFAULT_PIECE_SKIN, cardSkin: DEFAULT_CARD_SKIN, boardSkin: DEFAULT_BOARD_SKIN, setPieceSkin() {}, setCardSkin() {}, setBoardSkin() {} })

export function SkinProvider({ children }) {
  const [pieceSkin, setPiece] = useState(() => load(PIECE_KEY, PIECE_SKINS, DEFAULT_PIECE_SKIN))
  const [cardSkin, setCard] = useState(() => load(CARD_KEY, CARD_SKINS, DEFAULT_CARD_SKIN))
  const [boardSkin, setBoard] = useState(() => load(BOARD_KEY, BOARD_SKINS, DEFAULT_BOARD_SKIN))
  useEffect(() => { preloadPieceSkin(pieceSkin) }, [pieceSkin])
  const value = useMemo(() => ({
    pieceSkin,
    cardSkin,
    setPieceSkin: id => { if (PIECE_SKINS[id]) { setPiece(id); save(PIECE_KEY, id) } },
    setCardSkin: id => { if (CARD_SKINS[id]) { setCard(id); save(CARD_KEY, id) } },
    boardSkin,
    setBoardSkin: id => { if (BOARD_SKINS[id]) { setBoard(id); save(BOARD_KEY, id) } },
  }), [pieceSkin, cardSkin, boardSkin])
  return <SkinCtx.Provider value={value}>{children}</SkinCtx.Provider>
}

export function useSkins() {
  return useContext(SkinCtx)
}
