// Card skin registry — how a card LOOKS (its color and icon), kept apart
// from what it DOES (game/cards.js). Every card visual in the app (shop
// rows, hand tiles, opponent chips, the "card played" splash, How to play,
// the menu fan) goes through getCardArt(), so a different card look is one
// more skin entry:  { id, art: { [cardId]: { color, Icon } } }.
const LINE = '#16141F'
const FILL = '#FFFFFF'
const P = { fill: FILL, stroke: LINE, strokeWidth: 3.5, strokeLinejoin: 'round' }
const L = { fill: 'none', stroke: LINE, strokeWidth: 3.5, strokeLinecap: 'round' }

const ICONS = {
  barricade: () => <path d="M6 14 H42 V26 H6 Z M12 26 H17 V42 H12 Z M31 26 H36 V42 H31 Z" {...P} />,
  add_cell: () => (
    <>
      <path d="M8 8 H40 V40 H8 Z" {...P} />
      <path d="M24 15 V33 M15 24 H33" {...L} strokeWidth="4" />
    </>
  ),
  freeze: () => (
    <>
      <path d="M36 26 A12 12 0 1 1 12 26 A12 12 0 1 1 36 26 Z" {...P} />
      <path d="M24 5 V10 M24 42 V47 M3 26 H8 M40 26 H45" {...L} />
    </>
  ),
  smoke_screen: () => <path d="M14 36 H34 A8 8 0 0 0 34 20 A10 10 0 0 0 15 17 A9.5 9.5 0 0 0 14 36 Z" {...P} />,
  meteor: () => (
    <>
      <path d="M42 30 A12 12 0 1 1 18 30 A12 12 0 1 1 42 30 Z" {...P} />
      <path d="M6 8 L15 17 M13 5 L20 12" {...L} />
    </>
  ),
  unstable: () => (
    <>
      <path d="M40 24 A16 16 0 1 1 8 24 A16 16 0 1 1 40 24 Z" {...P} />
      <path d="M16 21 A9 9 0 0 1 31 17 M31 17 V11 M32 27 A9 9 0 0 1 17 31 M17 31 V37" {...L} />
    </>
  ),
  shield: () => (
    <>
      <path d="M24 5 L40 11 V24 C40 34 33 40 24 44 C15 40 8 34 8 24 V11 Z" {...P} />
      <path d="M17 24 L22 29 L31 19" {...L} />
    </>
  ),
}

export const CARD_SKINS = {
  default: {
    id: 'default',
    art: {
      barricade: { color: '#8FA35A', Icon: ICONS.barricade },
      add_cell: { color: '#C98B5A', Icon: ICONS.add_cell },
      freeze: { color: '#7CC6E0', Icon: ICONS.freeze },
      smoke_screen: { color: '#8C7F79', Icon: ICONS.smoke_screen },
      meteor: { color: '#E0614A', Icon: ICONS.meteor },
      unstable: { color: '#A77BC8', Icon: ICONS.unstable },
      shield: { color: '#6C7FD2', Icon: ICONS.shield },
    },
  },
}

export const DEFAULT_CARD_SKIN = 'default'

const FALLBACK = { color: '#8C7F79', Icon: () => <circle cx="24" cy="24" r="12" {...P} /> }

export function getCardArt(cardId, skinId = DEFAULT_CARD_SKIN) {
  const skin = CARD_SKINS[skinId] ?? CARD_SKINS[DEFAULT_CARD_SKIN]
  return skin.art[cardId] ?? FALLBACK
}
