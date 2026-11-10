// Card skin registry — how a card LOOKS (its color and icon), kept apart
// from what it DOES (game/cards.js). Every card visual in the app (shop
// rows, hand tiles, opponent chips, the "card played" splash, How to play,
// the menu fan) goes through getCardArt(), so a different card look is one
// more skin entry:  { id, art: { [cardId]: { color, Icon } } }.
import { CARD_ICON_SVG } from './defaultIcons'

const COLORS = {
  barricade: '#8FA35A', add_cell: '#C98B5A', freeze: '#7CC6E0', smoke_screen: '#8C7F79',
  meteor: '#E0614A', unstable: '#A77BC8', shield: '#6C7FD2',
}
const svgIcon = markup => function SvgIcon() { return <g dangerouslySetInnerHTML={{ __html: markup }} /> }
const skinFrom = (id, icons) => ({
  id,
  art: Object.fromEntries(Object.entries(COLORS).map(([card, color]) => [card, { color, Icon: icons[card] }])),
})

export const CARD_SKINS = {
  // shaded icons in the pieces' style (skins/cards/defaultIcons.js)
  default: skinFrom('default', Object.fromEntries(Object.entries(CARD_ICON_SVG).map(([k, v]) => [k, svgIcon(v)]))),
}

export const DEFAULT_CARD_SKIN = 'default'

const FALLBACK = { color: '#8C7F79', Icon: () => <circle cx="24" cy="24" r="12" fill="#FFFFFF" stroke="#16141F" strokeWidth="3" /> }

export function getCardArt(cardId, skinId = DEFAULT_CARD_SKIN) {
  const skin = CARD_SKINS[skinId] ?? CARD_SKINS[DEFAULT_CARD_SKIN]
  return skin.art[cardId] ?? FALLBACK
}
