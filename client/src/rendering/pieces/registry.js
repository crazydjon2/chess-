import DefaultPiece, { DefaultPieceDefs } from './DefaultPiece'

export const pieceRenderers = {
  default: {
    Component: DefaultPiece,
    Defs: DefaultPieceDefs,
  },
}

export function getRenderer(skin = 'default') {
  return pieceRenderers[skin] ?? pieceRenderers.default
}
