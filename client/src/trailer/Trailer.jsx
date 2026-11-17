// Promo trailer (vertical 9:16), a pure function of time t. Rendered frame
// by frame by tools/trailer/render.mjs (window.__seek in main.jsx). Footage
// comes from tools/trailer/capture.mjs; times below are seconds in those clips.
import { CardIcon, Piece } from '../skins/Piece'
import { CARD_DEFS } from '../game/cards'
import './trailer.css'

import { BOARD_PATTERNS, boardName } from '../game/boardPatterns'

export const SOURCES = ['draft', 'freeze', 'shield', 'unstable']
const FAN_CARDS = ['meteor', 'freeze', 'shield', 'unstable', 'smoke_screen']

// ── time helpers ───────────────────────────────────────────────────────
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x))
const prog = (t, a, b) => clamp((t - a) / (b - a))
const lerp = (a, b, p) => a + (b - a) * p
const easeOut = p => 1 - (1 - p) ** 3
const easeIn = p => p ** 3
const backOut = (p, s = 2.2) => 1 + (s + 1) * (p - 1) ** 3 + s * (p - 1) ** 2
function shake(t, t0, dur, amp) {
  const p = (t - t0) / dur
  if (p < 0 || p > 1) return [0, 0]
  const k = amp * (1 - p) ** 2
  return [Math.sin(t * 91) * k, Math.cos(t * 77) * k]
}

// Board square → % of the 1080×1920 sandbox frame (6×6 board).
function sq(name) {
  const f = name.charCodeAt(0) - 97, r = Number(name.slice(1))
  return [((150 + 157 * f) / 1080) * 100, ((1290 - 143 * (r - 1)) / 1920) * 100]
}

// ── timeline ───────────────────────────────────────────────────────────
// Battle: three cards, each long enough to read — the in-game card slam,
// then the effect at real speed, with a caption saying what it does.
const SHOW = 2.1
const battle = [
  { card: 'freeze', in: 3.15, at: 'e4', word: 'FROZEN!', color: '#7CC6E0', stampAt: 0.45, desc: 'Invisible trap — step on it, skip a turn' },
  { card: 'shield', in: 3.2, at: 'd4', word: 'BOUNCE!', color: '#8FA2FF', stampAt: 0.5, desc: 'Takes a hit — the attacker bounces off' },
  { card: 'unstable', in: 4.6, at: 'd4', word: 'WHAT?!', color: '#C69BEA', stampAt: 0.72, desc: 'The enemy queen starts mutating' },
]
// Each build on a different map (board pattern) — see game/boardPatterns.js.
const pattern = id => Object.values(BOARD_PATTERNS).flat().find(p => p.id === id)
const BUILDS = [
  {
    name: 'RUSH', color: '#F26B3A', tag: 'hit first, hit hard', map: pattern('bottleneck'),
    pieces: 'Kc1 Nc2 Nd2 Pa2 Pb2 Pf2 Pe2', cards: ['meteor', 'freeze'],
  },
  {
    name: 'FORTRESS', color: '#8FA2FF', tag: 'nobody gets through', map: BOARD_PATTERNS[2].find(p => p.id === 'bastions'),
    pieces: 'Kd1 Rb1 Rf1 Pa2 Pb2 Pc2 Pd2 Pe2 Pf2 Pg2', cards: ['shield', 'barricade'],
  },
  {
    name: 'CHAOS', color: '#C69BEA', tag: 'good luck reading this', map: pattern('island'),
    pieces: 'Ke1 Qd2 Bc1 Nf2', cards: ['unstable', 'smoke_screen', 'add_cell'],
  },
]
const BUILD_LEN = 1.4
// a grid of other maps, after the builds
const MAPS = ['centerWall', 'columns', 'ring', 'diagonals', 'cross', 'corridor', 'fortress', 'fourTowers', 'flankGaps']
  .map(id => Object.values(BOARD_PATTERNS).flat().find(p => p.id === id))

const T = { hook: 2.35, cards: 1.15, word: 0.7, draft: 3.2 }
let at = 0
const next = len => { const s = at; at += len; return [s, at] }
const seg = (len, kind, extra = {}) => { const [a, b] = next(len); return { a, b, kind, ...extra } }
export const SEGMENTS = [
  seg(T.hook, 'hook'),
  seg(T.cards, 'cards'),
  seg(T.word, 'word', { word: 'DRAFT', stretch: 'A', color: '#F2B544' }),
  seg(T.draft, 'draft'),
  seg(T.word, 'word', { word: 'BATTLE', stretch: 'A', color: '#F26B3A' }),
  ...battle.map(c => seg(SHOW, 'battle', c)),
  seg(T.word, 'word', { word: 'STRATEGIES', stretch: 'E', color: '#C69BEA' }),
  ...BUILDS.map((b, i) => seg(BUILD_LEN, 'build', { build: b, i })),
  seg(1.5, 'allcards'),
  seg(1.5, 'maps'),
  seg(3.2, 'end'),
]
export const DURATION = SEGMENTS.at(-1).b

// ── pieces ─────────────────────────────────────────────────────────────
function Footage({ footage, active }) {
  // every source stays mounted (so it's loaded); only the active one shows
  return SOURCES.map(id => {
    const on = active?.src === id
    return (
      <video
        key={id}
        data-src={id}
        data-time={on ? active.time.toFixed(4) : ''}
        src={`${footage}${id}.mp4`}
        muted
        playsInline
        preload="auto"
        className="tr-video"
        style={on
          ? { visibility: 'visible', transformOrigin: `${active.focus[0]}% ${active.focus[1]}%`, transform: `translate(${active.dx ?? 0}px, ${active.dy ?? 0}px) scale(${active.zoom})` }
          : { visibility: 'hidden' }}
      />
    )
  })
}

// A word slammed onto the screen; `stretch` letter repeats as it's shouted.
function Word({ t, a, b, word, stretch, color }) {
  const lt = t - a
  const extra = Math.round(clamp(lt / 0.32) * 4) // DRAFT → DRAAAAAFT
  const i = word.indexOf(stretch)
  const letters = [...word.slice(0, i + 1), ...Array(extra).fill(stretch), ...word.slice(i + 1)]
  const pop = backOut(prog(lt, 0, 0.18))
  const [sx, sy] = shake(lt, 0.02, 0.35, 9)
  const out = easeIn(prog(t, b - 0.12, b))
  const size = Math.min(78, 372 / (letters.length * 0.86))
  return (
    <div className="tr-title" style={{ opacity: 1 - out }}>
      <Burst t={lt} color={color} />
      <div className="tr-word" style={{ color, fontSize: size, transform: `translate(${sx}px, ${sy}px) scale(${lerp(2.6, 1, pop) * (1 + out * 0.4)})` }}>
        {letters.map((ch, k) => <span key={k} style={{ display: 'inline-block', transform: `translateY(${Math.sin(lt * 18 + k) * 3}px)` }}>{ch}</span>)}
      </div>
    </div>
  )
}

// Rotating speed-lines behind title cards.
function Burst({ t, color }) {
  return <div className="tr-burst" style={{ '--c': color, transform: `rotate(${t * 40}deg) scale(${1 + 0.05 * Math.sin(t * 9)})` }} />
}

// Comic stamp ("FROZEN!") hitting the screen.
function Stamp({ t, t0, text, color, x = 50, y = 30, rot = -8, size = 44 }) {
  const lt = t - t0
  if (lt < 0) return null
  const p = backOut(prog(lt, 0, 0.16), 2.6)
  return (
    <div className="tr-stamp" style={{ left: `${x}%`, top: `${y}%`, color, fontSize: size, transform: `translate(-50%, -50%) rotate(${rot}deg) scale(${lerp(3, 1, p)})`, opacity: prog(lt, 0, 0.05) }}>
      {text}
    </div>
  )
}

function Caption({ t, a, b, text, sub, icon }) {
  const p = easeOut(prog(t, a, a + 0.25)), q = easeIn(prog(t, b - 0.15, b))
  return (
    <div className="tr-caption" style={{ opacity: p * (1 - q) }}>
      <div className="tr-caption-head" style={{ transform: `translateY(${lerp(-30, 0, p)}px)` }}>
        {icon && <CardIcon id={icon} size={42} radius={9} iconScale={0.58} />}
        <b>{text}</b>
      </div>
      {sub && <span style={{ transform: `scale(${lerp(0.6, 1, backOut(prog(t, a + 0.12, a + 0.35)))})` }}>{sub}</span>}
    </div>
  )
}

const LETTER = { K: 'king', Q: 'queen', R: 'rook', B: 'bishop', N: 'knight', P: 'pawn' }
// 'Kc1 Pa2' (white) / 'kc8' lowercase = black → { c1: { type, color } }
function parsePieces(spec) {
  return Object.fromEntries(spec.split(/\s+/).filter(Boolean).map(s => [s.slice(1), {
    type: LETTER[s[0].toUpperCase()], color: s[0] === s[0].toUpperCase() ? 'white' : 'black',
  }]))
}

// A static board of any size/map. `piece(sq, k, info)` → style for that
// piece (k = its index), so scenes can animate pieces individually.
function Grid({ rows, cols, blocked = [], pieces = {}, width = 288, piece, extra }) {
  const cell = width / cols
  const cells = []
  for (let r = rows; r >= 1; r--) {
    for (let f = 0; f < cols; f++) {
      const name = String.fromCharCode(97 + f) + r
      const void_ = blocked.includes(name)
      cells.push(<span key={name} className={`tr-mb-cell ${void_ ? 'void' : (f + r) % 2 ? 'lt' : 'dk'}`} />)
    }
  }
  const list = Object.entries(pieces)
  return (
    <div className="tr-mb" style={{ gridTemplateColumns: `repeat(${cols}, ${cell}px)`, gridTemplateRows: `repeat(${rows}, ${cell}px)` }}>
      {cells}
      {list.map(([name, info], k) => {
        const f = name.charCodeAt(0) - 97, r = Number(name.slice(1))
        return (
          <span key={name} className="tr-mb-pc" style={{ left: f * cell, top: (rows - r) * cell, width: cell, height: cell, ...(piece?.(name, k, info) ?? {}) }}>
            <Piece type={info.type} color={info.color} size={cell * 0.92} center />
          </span>
        )
      })}
      {extra}
    </div>
  )
}

// ── scenes ─────────────────────────────────────────────────────────────
// Hook: "tired of regular chess?" — a grey, sleepy classic board, a lazy
// e2-e4… then a meteor card smashes it and the colour comes back.
const START = parsePieces('Ra1 Nb1 Bc1 Qd1 Ke1 Bf1 Ng1 Rh1 Pa2 Pb2 Pc2 Pd2 Pe2 Pf2 Pg2 Ph2 ra8 nb8 bc8 qd8 ke8 bf8 ng8 rh8 pa7 pb7 pc7 pd7 pe7 pf7 pg7 ph7')
const SMASH = 1.42
// deterministic "random" per piece
const rnd = (k, salt) => { const x = Math.sin(k * 127.1 + salt * 311.7) * 43758.5453; return x - Math.floor(x) }
function Hook({ t }) {
  const words = ['TIRED', 'OF', 'REGULAR', 'CHESS?']
  const smashed = t >= SMASH
  const after = t - SMASH
  const grey = smashed ? 0 : 1
  const zoom = smashed ? 1.12 + 0.05 * easeOut(prog(after, 0, 0.6)) : lerp(1, 1.1, prog(t, 0, SMASH))
  const [sx, sy] = shake(t, SMASH, 0.55, 22)
  const flash = Math.max(0, 1 - Math.abs(t - SMASH) / 0.12)
  // meteor card streaking in from the top right
  const mp = easeIn(prog(t, SMASH - 0.45, SMASH))
  const pawn = easeOut(prog(t, 0.55, 1.05))
  const piece = (name, k) => {
    if (!smashed) {
      if (name === 'e2') return { transform: `translateY(${-pawn * 40 * 2}px)` } // e2 → e4 (2 cells of 40px)
      return null
    }
    // everything flies away from the impact (board centre)
    const f = name.charCodeAt(0) - 97 - 3.5, r = Number(name.slice(1)) - 4.5
    const len = Math.hypot(f, r) || 1
    const v = 220 + rnd(k, 1) * 300
    const p = easeOut(prog(after, 0, 1.1))
    return {
      transform: `translate(${(f / len) * v * p}px, ${((-r / len) * v - 120 * rnd(k, 2)) * p + 260 * p * p}px) rotate(${(rnd(k, 3) - 0.5) * 900 * p}deg) scale(${1 + 0.3 * p})`,
      opacity: 1 - prog(after, 0.75, 1.0),
    }
  }
  return (
    <div className="tr-title">
      <div className="tr-hook-bg" style={{ filter: `grayscale(${grey}) brightness(${smashed ? 1 : 0.75})` }} />
      {smashed && <Burst t={after} color="#F26B3A" />}
      <div style={{ position: 'relative', transform: `translate(${sx}px, ${sy + 40}px) scale(${zoom})`, filter: `grayscale(${grey}) brightness(${smashed ? 1 : 0.8}) contrast(${smashed ? 1 : 0.85})` }}>
        <Grid rows={8} cols={8} width={320} pieces={START} piece={piece} />
        {smashed && <div className="tr-crater" style={{ opacity: 1 - prog(after, 0.4, 0.9), transform: `scale(${lerp(0.3, 1.6, easeOut(prog(after, 0, 0.5)))})` }} />}
      </div>

      {/* sleepy captions */}
      <div className="tr-tired" style={{ opacity: 1 - prog(t, SMASH - 0.05, SMASH + 0.02) }}>
        {words.map((w, k) => {
          const p = backOut(prog(t, k * 0.17, k * 0.17 + 0.14), 2.4)
          return <div key={w} className={k === 3 ? 'big' : ''} style={{ opacity: prog(t, k * 0.17, k * 0.17 + 0.03), transform: `scale(${lerp(2.6, 1, p)}) rotate(${k === 3 ? -3 : 0}deg)` }}>{w}</div>
        })}
      </div>
      {!smashed && (
        <>
          {[0, 1, 2].map(k => {
            const z = prog(t, 0.6 + k * 0.18, 1.6 + k * 0.18)
            return <div key={k} className="tr-zzz" style={{ opacity: z > 0 ? 1 - z : 0, transform: `translate(${70 + k * 18 + z * 30}px, ${-z * 90}px) rotate(${-12 + k * 6}deg)`, fontSize: 22 + k * 8 }}>z</div>
          })}
          <div className="tr-meh" style={{ opacity: prog(t, 0.95, 1.05) }}>e4. again.</div>
          <div className="tr-meteor-in" style={{ opacity: prog(t, SMASH - 0.45, SMASH - 0.4), transform: `translate(${lerp(260, 0, mp)}px, ${lerp(-430, 40, mp)}px) rotate(${lerp(30, -20, mp)}deg) scale(${lerp(0.8, 1.15, mp)})` }}>
            <span className="tr-meteor-trail" />
            <CardIcon id="meteor" size={130} radius={22} iconScale={0.6} />
          </div>
        </>
      )}
      <div className="tr-flash" style={{ opacity: flash }} />
      <Stamp t={t} t0={SMASH + 0.08} text="BONK!" color="#FFC65A" x={50} y={22} rot={-8} size={70} />
      <Stamp t={t} t0={SMASH + 0.42} text="LET’S FIX THAT." color="#FFF6E8" x={50} y={80} rot={3} size={34} />
    </div>
  )
}

// Every magic card in the game: "7 MAGIC CARDS".
const CARD_IDS = Object.keys(CARD_DEFS)
function AllCards({ t }) {
  const out = easeIn(prog(t, 1.38, 1.5))
  return (
    <div className="tr-title" style={{ opacity: 1 - out }}>
      <Burst t={t} color="#F26B3A" />
      <div className="tr-allcards">
        {CARD_IDS.map((id, k) => {
          const p = backOut(prog(t, k * 0.06, 0.22 + k * 0.06), 2.2)
          return (
            <div key={id} className="tr-allcard" style={{ opacity: prog(t, k * 0.06, k * 0.06 + 0.04), transform: `translateY(${lerp(-80, 0, p)}px) scale(${lerp(1.9, 1, p)}) rotate(${(rnd(k, 7) - 0.5) * 10}deg)` }}>
              <CardIcon id={id} size={88} radius={16} iconScale={0.58} />
              <span>{CARD_DEFS[id].name}</span>
            </div>
          )
        })}
      </div>
      <Stamp t={t} t0={0.55} text={`${CARD_IDS.length} MAGIC CARDS`} color="#FFC65A" x={50} y={15} rot={-4} size={34} />
    </div>
  )
}

// A wall of other maps: "15 BOARDS".
const BOARD_COUNT = Object.values(BOARD_PATTERNS).flat().length
function Maps({ t }) {
  const out = easeIn(prog(t, 1.38, 1.5))
  return (
    <div className="tr-title" style={{ opacity: 1 - out }}>
      <Burst t={t} color="#7CC6E0" />
      <div className="tr-maps">
        {MAPS.map((m, k) => {
          const p = backOut(prog(t, k * 0.05, 0.2 + k * 0.05), 2)
          return (
            <div key={m.id} className="tr-map" style={{ opacity: prog(t, k * 0.05, k * 0.05 + 0.04), transform: `scale(${lerp(1.8, 1, p)}) rotate(${(rnd(k, 5) - 0.5) * 8}deg)` }}>
              <Grid rows={m.rows} cols={m.cols} blocked={m.blockedCells} width={104} />
              <span>{boardName(m)}</span>
            </div>
          )
        })}
      </div>
      <Stamp t={t} t0={0.55} text={`${BOARD_COUNT} BOARDS`} color="#7CC6E0" x={50} y={50} rot={-6} size={56} />
    </div>
  )
}

function Cards({ t }) {
  const line1 = backOut(prog(t, 0.0, 0.16)), line2 = backOut(prog(t, 0.18, 0.34))
  const [sx, sy] = shake(t, 0.18, 0.3, 8)
  return (
    <div className="tr-title">
      <Burst t={t} color="#F2B544" />
      <div className="tr-pitch" style={{ transform: `translate(${sx}px, ${sy}px)` }}>
        <div style={{ transform: `scale(${lerp(2.2, 1, line1)})`, opacity: prog(t, 0, 0.05) }}>CHESS,<br />BUT THE CARDS</div>
        <div className="gold" style={{ transform: `scale(${lerp(2.6, 1, line2)})`, opacity: prog(t, 0.18, 0.23) }}>BREAK THE RULES</div>
      </div>
      <div className="tr-fan">
        {FAN_CARDS.map((id, k) => {
          const p = backOut(prog(t, 0.3 + k * 0.06, 0.58 + k * 0.06), 1.6)
          const ang = (k - 2) * 12
          return (
            <span key={id} className="tr-fan-card" style={{ transform: `translateX(${(k - 2) * 58}px) translateY(${lerp(420, Math.abs(k - 2) * 12, p)}px) rotate(${lerp(ang * 3, ang, p)}deg)` }}>
              <CardIcon id={id} size={92} radius={16} iconScale={0.58} />
            </span>
          )
        })}
      </div>
    </div>
  )
}

function Build({ t, build, len }) {
  const p = backOut(prog(t, 0, 0.2), 1.8)
  const [sx, sy] = shake(t, 0, 0.25, 7)
  const out = easeIn(prog(t, len - 0.12, len))
  return (
    <div className="tr-title" style={{ opacity: 1 - out }}>
      <Burst t={t} color={build.color} />
      <div className="tr-build" style={{ '--c': build.color, transform: `translate(${sx}px, ${sy}px) scale(${lerp(1.8, 1, p)})`, opacity: prog(t, 0, 0.05) }}>
        <div className="tr-build-name">{build.name}</div>
        <div className="tr-build-tag">{build.tag}</div>
        <Grid rows={build.map.rows} cols={build.map.cols} blocked={build.map.blockedCells} pieces={parsePieces(build.pieces)} width={288} piece={(sq, k) => { const p = backOut(prog(t, 0.12 + k * 0.04, 0.32 + k * 0.04), 2); return { transform: `translateY(${lerp(-60, 0, p)}px) scale(${lerp(1.6, 1, p)})`, opacity: prog(t, 0.12 + k * 0.04, 0.16 + k * 0.04) } }} />
        <div className="tr-build-map">map: {boardName(build.map)}</div>
        <div className="tr-build-cards">
          {build.cards.map((c, k) => {
            const q = backOut(prog(t, 0.45 + k * 0.1, 0.65 + k * 0.1), 2)
            return (
              <div key={c} className="tr-build-card" style={{ opacity: prog(t, 0.45 + k * 0.1, 0.5 + k * 0.1), transform: `scale(${lerp(2, 1, q)}) rotate(${(k - 1) * 4}deg)` }}>
                <CardIcon id={c} size={58} radius={12} iconScale={0.58} />
                <span>{CARD_DEFS[c].name}</span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function End({ t }) {
  const lines = ['1v1 ONLINE', 'FREE', 'IN YOUR BROWSER']
  const logo = backOut(prog(t, 1.0, 1.25), 2)
  const [sx, sy] = shake(t, 1.0, 0.35, 8)
  return (
    <div className="tr-title">
      <Burst t={t} color="#F2B544" />
      <div className="tr-end-lines" style={{ opacity: 1 - easeIn(prog(t, 0.85, 1.0)) }}>
        {lines.map((l, k) => {
          const p = backOut(prog(t, k * 0.2, k * 0.2 + 0.16))
          return <div key={l} style={{ opacity: prog(t, k * 0.2, k * 0.2 + 0.04), transform: `scale(${lerp(2.4, 1, p)})` }}>{l}</div>
        })}
      </div>
      <div className="tr-end" style={{ opacity: prog(t, 1.0, 1.05), transform: `translate(${sx}px, ${sy}px) scale(${lerp(2.4, 1, logo) * (1 + 0.015 * Math.sin(t * 4))})` }}>
        <div className="tr-logo"><b>MIS</b>CHESS</div>
        <div className="tr-url" style={{ opacity: prog(t, 1.35, 1.55) }}>mischess.com</div>
        <div className="tr-cta" style={{ opacity: prog(t, 1.7, 1.9), transform: `scale(${1 + 0.04 * Math.sin(t * 7)})` }}>PLAY FREE NOW</div>
      </div>
    </div>
  )
}

// ── composition ────────────────────────────────────────────────────────
export default function Trailer({ t, footage }) {
  const s = SEGMENTS.find(x => t >= x.a && t < x.b) ?? SEGMENTS.at(-1)
  const lt = t - s.a
  let active = null
  let overlay = null

  if (s.kind === 'hook') {
    overlay = <Hook t={lt} />
  } else if (s.kind === 'allcards') {
    overlay = <AllCards t={lt} />
  } else if (s.kind === 'maps') {
    overlay = <Maps t={lt} />
  } else if (s.kind === 'draft') {
    active = { src: 'draft', time: 0.8 + lt * 3.2, zoom: 1.04, focus: [50, 50] }
    overlay = (
      <>
        <Caption t={lt} a={0} b={1.6} text="BUILD YOUR ARMY" sub="pick pieces, place them" />
        <Caption t={lt} a={1.6} b={3.2} text="BUY CARDS" sub="every card bends a rule" />
      </>
    )
  } else if (s.kind === 'battle') {
    const name = CARD_DEFS[s.card].name.toUpperCase()
    const caption = <Caption t={lt} a={0} b={SHOW} text={name} sub={s.desc} icon={s.card} />
    if (lt < 0.65) {
      // the in-game card slam
      active = { src: s.card, time: 1.45 + lt * 1.5, zoom: 1.05, focus: [50, 50] }
      overlay = caption
    } else {
      const e = lt - 0.65
      const [dx, dy] = shake(e, s.stampAt, 0.3, 9)
      active = { src: s.card, time: s.in + e, zoom: lerp(1.25, 1.38, e / (SHOW - 0.65)), focus: sq(s.at), dx, dy }
      overlay = (
        <>
          {caption}
          <Stamp t={lt} t0={s.stampAt + 0.65} text={s.word} color={s.color} x={50} y={70} rot={-6} size={54} />
        </>
      )
    }
  } else if (s.kind === 'word') {
    overlay = <Word t={t} {...s} />
  } else if (s.kind === 'cards') {
    overlay = <Cards t={lt} />
  } else if (s.kind === 'build') {
    overlay = <Build t={lt} build={s.build} len={s.b - s.a} />
  } else if (s.kind === 'end') {
    overlay = <End t={lt} />
  }

  return (
    <div className="tr">
      <Footage footage={footage} active={active} />
      {!active && <div className="tr-bg" />}
      {overlay}
      <div className="tr-vignette" />
    </div>
  )
}
