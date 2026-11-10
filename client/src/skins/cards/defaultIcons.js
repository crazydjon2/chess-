// Default card icons — SVG markup on a 48×48 grid, drawn like the pieces:
// white face, cool shade on the lower-right, dark outline, details in the
// card's own colour (--card-c, set by <CardIcon>). Kept as plain strings
// (no ids → many icons on one page never clash) so a script can preview
// them outside React.
const LINE = '#16141F'
const W = 'var(--card-w, #FFFFFF)'     // face: white with a hint of the card colour
const SH = 'var(--card-sh, #D8D2E4)'   // shade: tinted by the card colour
const FLAME = "#FFC65A"
const ACC = `var(--card-c, ${LINE})`
const st = (w = 3) => `stroke="${LINE}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round"`

// a stroke drawn twice: thick dark, then thinner fill colour → outlined line
const outlined = (d, inner = W, w = 4.2) =>
  `<path d="${d}" fill="none" ${st(w + 4)}/><path d="${d}" fill="none" stroke="${inner}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`

function snowflake() {
  const c = 24, R = 17, b = 11.5, bl = 4.6
  let arms = '', twigs = ''
  for (let i = 0; i < 3; i++) {
    const a = (Math.PI / 3) * i + Math.PI / 2
    const dx = Math.cos(a), dy = Math.sin(a)
    arms += `M${(c - dx * R).toFixed(2)} ${(c - dy * R).toFixed(2)} L${(c + dx * R).toFixed(2)} ${(c + dy * R).toFixed(2)} `
    for (const s of [1, -1]) {
      const px = c + dx * b * s, py = c + dy * b * s
      for (const t of [1, -1]) {
        const ta = a + (s > 0 ? 0 : Math.PI) + t * (Math.PI / 3.3)
        twigs += `M${px.toFixed(2)} ${py.toFixed(2)} L${(px + Math.cos(ta) * bl).toFixed(2)} ${(py + Math.sin(ta) * bl).toFixed(2)} `
      }
    }
  }
  return `${outlined(arms + twigs, W, 3.2)}
    <path d="M24 18.5 L28.8 21.25 V26.75 L24 29.5 L19.2 26.75 V21.25 Z" fill="${ACC}" ${st(2.6)}/>`
}


// Stone: faceted boulder — light top plane, mid front, dark right side
const STONE = '#D6CDC4', STONE_SH = '#9F938A', STONE_HI = '#F2ECE6'
const ROCK = 'M7 39 L8.5 29 L14 20 L23 13.5 L33 14 L40 20.5 L43 30 L40.5 39 Z'
const boulder = `
  <path d="M38 39 L39.5 35 L44 34.5 L45.5 39 Z" fill="${STONE_SH}" ${st(2.4)}/>
  <path d="${ROCK}" fill="${STONE}" ${st(3)}/>
  <path d="M14 20 L23 13.5 L33 14 L27.5 20.5 L18 23.5 Z" fill="${STONE_HI}"/>
  <path d="M33 14 L40 20.5 L43 30 L40.5 39 L30 39 L32 28.5 L27.5 20.5 Z" fill="${STONE_SH}"/>
  <path d="M18 23.5 L27.5 20.5 L32 28.5 L30 39 M18 23.5 L15.5 31" fill="none" ${st(1.8)} opacity="0.5"/>
  <path d="M16.5 18.5 L23 13.5 L29 13.8 L24.5 16.5 L19.5 19 Z" fill="${ACC}" ${st(1.8)}/>
  <path d="${ROCK}" fill="none" ${st(3)}/>
  <path d="M21.5 39 L23.5 34 L21 30.5" fill="none" ${st(2)}/>`

export const CARD_ICON_SVG = {
  barricade: boulder + `<path d="M5 42 H43" fill="none" ${st(3)}/>`,

  add_cell: `
    <rect x="5" y="7" width="30" height="30" rx="3" fill="${W}"/>
    <path d="M20 7 H32 A3 3 0 0 1 35 10 V22 H20 Z M5 22 H20 V37 H8 A3 3 0 0 1 5 34 Z" fill="${SH}"/>
    <rect x="5" y="7" width="30" height="30" rx="3" fill="none" ${st()}/>
    <circle cx="35" cy="35" r="9.5" fill="${ACC}" ${st()}/>
    <path d="M35 30 V40 M30 35 H40" fill="none" stroke="${W}" stroke-width="3.4" stroke-linecap="round"/>`,

  freeze: snowflake(),

  smoke_screen: `
    <path d="M20 28 H38 A6.5 6.5 0 0 0 38 15 A8.5 8.5 0 0 0 22.5 13 A7.5 7.5 0 0 0 20 28 Z" fill="${SH}" ${st()}/>
    <path d="M9 36 H29 A7.5 7.5 0 0 0 29 21 A9.5 9.5 0 0 0 11.5 19 A8.5 8.5 0 0 0 9 36 Z" fill="${W}" ${st()}/>
    <path d="M8 42 H22 M27 42 H33" fill="none" ${st(3)}/>`,

  meteor: `
    <path d="M4 5 C13 8 20 12 26 18 L18 26 C12 20 8 13 4 5 Z" fill="${FLAME}" ${st()}/>
    <path d="M10 10.5 C15 13 19 16 22.5 19.5 L19.5 22.5 C16 19 13 15 10 10.5 Z" fill="${W}" opacity="0.55"/>
    <path d="M15 4 L21 8 M4 15 L8 21" fill="none" ${st(3)}/>
    <circle cx="30" cy="30" r="12" fill="${SH}"/>
    <circle cx="28.6" cy="28.6" r="10.4" fill="${W}"/>
    <circle cx="30" cy="30" r="12" fill="none" ${st()}/>
    <circle cx="26" cy="26.5" r="3" fill="${SH}" ${st(2.2)}/>
    <circle cx="34" cy="33" r="2.2" fill="${SH}" ${st(2.2)}/>
    <circle cx="27.5" cy="35.5" r="1.4" fill="${LINE}"/>`,

  unstable: `
    <path d="M9.9 29.1 A15 15 0 0 1 18.9 9.9" fill="none" ${st(3.4)}/>
    <path d="M23.1 8.4 L17.5 6.1 L20.3 13.7 Z" fill="${LINE}" ${st(2)}/>
    <path d="M38.1 18.9 A15 15 0 0 1 29.1 38.1" fill="none" ${st(3.4)}/>
    <path d="M24.9 39.6 L30.5 41.9 L27.7 34.3 Z" fill="${LINE}" ${st(2)}/>
    <path d="M17.5 34 Q19.5 27 21.5 24.5 H26.5 Q28.5 27 30.5 34 Z" fill="${W}" ${st()}/>
    <circle cx="24" cy="18" r="6.4" fill="${W}" ${st()}/>
    <rect x="15" y="33" width="18" height="6.5" rx="2" fill="${ACC}" ${st()}/>`,

  shield: `
    <path d="M24 5 L40 11 V24 C40 34 33 40 24 44 C15 40 8 34 8 24 V11 Z" fill="${W}"/>
    <path d="M24 5 L40 11 V24 C40 34 33 40 24 44 Z" fill="${SH}"/>
    <path d="M24 5 L40 11 V24 C40 34 33 40 24 44 C15 40 8 34 8 24 V11 Z" fill="none" ${st()}/>
    <path d="M16.5 24 L22 29.5 L32 18.5" fill="none" ${st(7.5)}/>
    <path d="M16.5 24 L22 29.5 L32 18.5" fill="none" stroke="${ACC}" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/>`,
}

// The stone as it STANDS on the board (neutral 'barricade' piece): the same
// boulder, base line at y≈39–42 (skins anchor ~0.15).
export const BARRICADE_PIECE_SVG = boulder
