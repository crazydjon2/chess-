export const IDLE = { type: 'idle' }

export function boardModeReducer(state, action) {
  switch (action.type) {
    case 'CLICK_SQUARE': {
      const { square, piece, playerColor } = action

      if (state.type === 'idle') {
        if (piece && piece.color === playerColor) {
          return { type: 'piece_selected', square, piece, legalMoves: action.legalMoves ?? [] }
        }
        return state
      }

      if (state.type === 'piece_selected') {
        if (square === state.square) return IDLE
        if (piece && piece.color === playerColor) {
          return { type: 'piece_selected', square, piece, legalMoves: action.legalMoves ?? [] }
        }
        return IDLE
      }

      if (state.type === 'card_targeting') {
        // target picked — Board emits play_card to server
        return IDLE
      }

      return state
    }

    case 'PLAY_CARD':
      return { type: 'card_targeting', card: action.card, validTargets: action.validTargets ?? [] }

    case 'DRAG_START':
      if (!action.piece || action.piece.color !== action.playerColor) return state
      return { type: 'dragging', fromSquare: action.square, piece: action.piece, overSquare: null, legalMoves: action.legalMoves ?? [] }

    case 'DRAG_OVER':
      if (state.type !== 'dragging') return state
      return { ...state, overSquare: action.square }

    case 'DROP':
      return IDLE

    case 'CANCEL':
      return IDLE

    default:
      return state
  }
}
