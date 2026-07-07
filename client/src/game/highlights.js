export function getHighlights(boardMode) {
  switch (boardMode.type) {
    case 'piece_selected':
      return {
        selected: boardMode.square,
        targets: boardMode.legalMoves,
        cardTargets: [],
        dragFrom: null,
        dragOver: null,
      }
    case 'card_targeting':
      return {
        selected: null,
        targets: [],
        cardTargets: boardMode.validTargets,
        dragFrom: null,
        dragOver: null,
      }
    case 'dragging':
      return {
        selected: null,
        targets: boardMode.legalMoves,
        cardTargets: [],
        dragFrom: boardMode.fromSquare,
        dragOver: boardMode.overSquare,
      }
    default:
      return { selected: null, targets: [], cardTargets: [], dragFrom: null, dragOver: null }
  }
}
