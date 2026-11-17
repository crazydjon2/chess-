// The 1200×630 social preview (og:image), drawn with the game's own pieces
// and cards. Story in one glance: a meteor card smashes the white queen
// mid-game — chess, but the cards break the rules.
import { Piece, CardIcon } from '../skins/Piece'
import './og.css'

const N = 5 // board is N×N
// [col, row] from top-left
const PIECES = [
  { at: [0, 0], type: 'rook', color: 'black' },
  { at: [2, 0], type: 'king', color: 'black', cls: 'shock' },
  { at: [1, 1], type: 'knight', color: 'black', cls: 'frozen' },
  { at: [3, 1], type: 'pawn', color: 'black' },
  { at: [2, 2], type: 'queen', color: 'white', cls: 'hit' },
  { at: [0, 3], type: 'pawn', color: 'white' },
  { at: [3, 3], type: 'bishop', color: 'white' },
  { at: [1, 4], type: 'rook', color: 'white', cls: 'shielded' },
  { at: [4, 4], type: 'king', color: 'white' },
]

// cover: the itch.io cover (630×500) — same scene, stacked layout
export default function OgCard({ cover = false }) {
  return (
    <div className={`og${cover ? ' cover' : ''}`} data-og-ready="1">
      <div className="og-glow" />
      <div className="og-checks" />

      <div className="og-left">
        <div className="og-logo"><b>MIS</b>CHESS</div>
        <div className="og-tag">Chess, but the cards<br /><em>break the rules.</em></div>
        <div className="og-chips">
          <span>Free</span><span>Online 1v1</span><span>In your browser</span>
        </div>
        <div className="og-url">mischess.com</div>
      </div>

      <div className="og-scene">
        <div className="og-board">
          {Array.from({ length: N * N }, (_, i) => {
            const c = i % N, r = Math.floor(i / N)
            return <span key={i} className={`og-sq ${(c + r) % 2 ? 'dk' : 'lt'}${c === 2 && r === 2 ? ' impact' : ''}`} />
          })}
          <span className="og-stone" style={{ '--c': 2, '--r': 4 }}><CardIcon id="barricade" size={78} plain iconScale={1} /></span>
          {PIECES.map((p, i) => (
            <span key={i} className={`og-pc ${p.cls ?? ''}`} style={{ '--c': p.at[0], '--r': p.at[1] }}>
              <Piece type={p.type} color={p.color} size={80} center />
              {p.cls === 'shielded' && <span className="og-bubble" />}
              {p.cls === 'frozen' && <span className="og-ice">❄</span>}
              {p.cls === 'shock' && <span className="og-sweat">!?</span>}
            </span>
          ))}
          <svg className="og-burst" viewBox="-100 -100 200 200" aria-hidden="true">
            <polygon points={burst(14, 96, 58)} fill="#FFC65A" stroke="#16141F" strokeWidth="7" strokeLinejoin="round" />
            <polygon points={burst(14, 66, 40)} fill="#F26B3A" />
          </svg>
          <span className="og-bonk">BONK!</span>
        </div>

        <div className="og-meteor">
          <span className="og-trail" />
          <span className="og-rock"><CardIcon id="meteor" size={150} radius={28} iconScale={0.62} /></span>
        </div>

        <div className="og-hand">
          <span className="og-card" style={{ '--a': '-14deg', '--x': '0px', '--y': '18px' }}><CardIcon id="freeze" size={112} radius={18} iconScale={0.55} /></span>
          <span className="og-card" style={{ '--a': '-2deg', '--x': '84px', '--y': '0px' }}><CardIcon id="shield" size={112} radius={18} iconScale={0.55} /></span>
          <span className="og-card" style={{ '--a': '11deg', '--x': '168px', '--y': '14px' }}><CardIcon id="smoke_screen" size={112} radius={18} iconScale={0.55} /></span>
        </div>
      </div>
    </div>
  )
}

// Comic-book starburst polygon: `n` spikes between radii R and r.
function burst(n, R, r) {
  const pts = []
  for (let i = 0; i < n * 2; i++) {
    const a = (Math.PI / n) * i + 0.2
    const rad = i % 2 ? r : R * (0.85 + 0.15 * Math.sin(i * 2.3))
    pts.push(`${(Math.cos(a) * rad).toFixed(1)},${(Math.sin(a) * rad).toFixed(1)}`)
  }
  return pts.join(' ')
}
