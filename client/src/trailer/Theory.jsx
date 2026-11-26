// 9:16 "grandmaster theory" parody: a famous classical finish, shot like an
// old film (sepia, grain, book notation, green analysis arrows) — then "but
// in Mischess…" the colour comes back and the card breaks it. Pure function
// of time t, registered in CLIPS (Clips.jsx); rendered by clips.mjs.
// Footage: tools/trailer/shots.mjs (432×768 logical); every `ft` is footage
// seconds, every coordinate footage px.
import { QUIZ_W, QUIZ_H, S, Words, Stamp, EndCard } from './Quiz'

const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x))
const prog = (t, a, b) => clamp((t - a) / (b - a))
const lerp = (a, b, p) => a + (b - a) * p
const easeOut = p => 1 - (1 - p) ** 3
const backOut = (p, s = 2.2) => 1 + (s + 1) * (p - 1) ** 3 + s * (p - 1) ** 2
function shake(t, t0, dur, amp) {
  const p = (t - t0) / dur
  if (p < 0 || p > 1) return [0, 0]
  const k = amp * (1 - p) ** 2
  return [Math.sin(t * 91) * k, Math.cos(t * 77) * k]
}
const rnd = n => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x) }

// Square centres in the opera footage (8×8, slight perspective).
const RANK_Y = [512, 467, 422, 380, 340, 298, 258, 220]
const sq = s => {
  const f = s.charCodeAt(0) - 97, r = +s[1] - 1
  return [220 + (f - 3.5) * (47 - r * 0.25), RANK_Y[r]]
}

export const THEORIES = {
  // Morphy vs Duke Karl & Count Isouard, Paris 1858: 16.Qb8+! Nxb8 17.Rd8#.
  opera: {
    src: 'opera', color: '#8FA2FF',
    board: [190, 562], cy: 376,
    kicker: 'paris · 1858',
    title: ['the most famous', 'finish in chess'],
    sub: 'morphy vs duke & count',
    // footage segments [from, to, clip seconds]; from === to is a freeze
    seq: [
      [0.6, 0.6, 2.7],      // 0 intro
      [1.6, 2.4, 0.9],      // 1 16.Qb8+!!
      [2.4, 3.0, 0.35],     // 2
      [3.0, 3.8, 0.8],      // 3 16...Nxb8
      [3.8, 4.4, 0.3],      // 4
      [4.4, 5.2, 0.8],      // 5 17.Rd8#
      [5.2, 5.2, 1.9],      // 6 CHECKMATE
      [5.2, 5.2, 1.8],      // 7 but in mischess… (colour returns)
      [7.5, 8.7, 1.2],      // 8 shield on the king
      [8.7, 9.4, 0.35],     // 9
      [9.4, 10.1, 0.8],     // 10 …Kxd8 (the shielded king eats the rook)
      [10.1, 10.75, 0.55],  // 11 the bishop goes for the king
      [10.75, 11.15, 1.5],  // 12 BONK (slow-mo)
      [11.15, 12.9, 2.3],   // 13 punch
    ],
    twist: 7, // first segment in colour
    // [segment, footage time, plain words, book notation] — under the board
    notes: [[1, 2.1, 'queen sac!!', '16. Qb8+'], [3, 3.4, 'knight takes', '16… Nxb8'], [5, 4.85, 'rook mates', '17. Rd8#'],
      [8, 7.6, 'shield!?', '17… Shield'], [10, 9.75, 'king takes', '17… Kxd8'], [11, 10.4, 'bishop takes??', '18. Bxd8']],
    // analysis arrows [from, to, colour, shown from [seg, ft], until [seg, ft]]
    arrows: [
      ['b3', 'b8', '#7FB241', [0, 0.6, 1.5], [1, 2.0]],
      ['d7', 'b8', '#7FB241', [2, 2.6], [3, 3.3]],
      ['d1', 'd8', '#7FB241', [4, 3.9], [5, 4.7]],
      ['g5', 'd8', '#FF4A3D', [11, 10.1], [12, 10.9]],
    ],
    mateStamp: 'CHECKMATE',
    mated: ['game over.'],
    but: ['but in', 'mischess…'],
    doing: ['shield', 'the king.'],
    casual: ['nope.'],
    stamp: { seg: 12, ft: 10.95, text: 'BONK!' },
    punch: ['1858: checkmate.', '2026: bonk.'],
    // (files: tools/trailer/sfx/music, licences in sfx/LICENSES.md)
    music: {
      // one track, continuous: muffled like a gramophone under the film, opens up on the twist
      old: { f: 'music/trailer-loop.wav', ss: 0, v: 0.9 },
      new: { f: 'music/trailer-loop.wav', ss: 'continue', v: 0.55 },
    },
  },
}

const END = 1.5
const DY = 440 // canvas y of the footage board centre

const segStart = (c, i) => c.seq.slice(0, i).reduce((s, x) => s + x[2], 0)
const bodyDur = c => segStart(c, c.seq.length)
export const theoryDuration = c => bodyDur(c) + END
// clip time of footage time `ft` inside segment i (a freeze: `ft` = seconds in)
function at(c, i, ft) {
  const [a, b, d] = c.seq[i]
  const t0 = segStart(c, i)
  if (a === b) return t0 + Math.min(ft - a, d)
  return t0 + d * clamp((ft - a) / (b - a))
}
const atSpec = (c, [i, ft, plus = 0]) => at(c, i, ft) + plus
function footTime(c, t) {
  let tt = t
  for (const [a, b, d] of c.seq) {
    if (tt <= d) return a === b ? a : a + (b - a) * (tt / d)
    tt -= d
  }
  return c.seq.at(-1)[1]
}

export function theorySfx(c) {
  const T = (i, ft) => at(c, i, ft)
  const tw = segStart(c, c.twist), end = bodyDur(c)
  const clack = 'kenney/impact/Audio/impactPlank_medium_001.ogg'
  const { old, new: neu } = c.music ?? {}
  return [
    // music: the aria under the film (thin, like a gramophone), cut dead on
    // the twist; the fun track from the twist to the end
    ...(old ? [{ t: 0, f: old.f, ss: old.ss, dur: tw, v: old.v, fadeIn: 0.3, fadeOut: 0.05, fx: 'highpass=f=350,lowpass=f=1600' }] : []),
    ...(neu ? [{ t: tw, f: neu.f, ss: neu.ss === 'continue' ? old.ss + tw : neu.ss, dur: theoryDuration(c) - tw, v: neu.v, fadeOut: 1.2 }] : []),
    { t: 0.3, f: S.whoosh, v: 0.35 },
    { t: 0.9, f: S.pop, v: 0.8 },
    { t: T(1, 2.25), f: clack, v: 1.2 },
    { t: T(3, 3.6), f: clack, v: 1.2 },
    { t: T(5, 5.05), f: clack, v: 1.4 },
    { t: segStart(c, 6) + 0.1, f: S.bell, v: 0.9 },
    { t: tw - 0.05, f: S.whoosh, v: 0.8 },
    { t: tw + 0.05, f: S.question, v: 0.6 },
    { t: T(8, 7.6), f: S.confirm, v: 0.6 },
    { t: T(8, 8.05), f: S.card, v: 0.9 },
    { t: T(10, 9.8), f: clack, v: 1.3 },
    { t: T(12, 10.95), f: S.bell, v: 0.9 },
    { t: T(12, 10.95), f: S.metal, v: 0.9 },
    { t: segStart(c, 13) + 0.05, f: S.pop2, v: 0.7 },
    { t: end, f: S.whoosh, v: 0.5 },
    { t: end + 0.15, f: S.confirm, v: 0.5 },
  ]
}

// Old-film look: sepia (on the stage), grain, flicker, scratches.
function Film({ t, k }) {
  if (k <= 0) return null
  const fr = Math.floor(t * 12)
  const lines = [0, 1].filter(i => rnd(fr * 3 + i) > 0.45).map(i => ({ x: rnd(fr * 7 + i) * QUIZ_W, o: 0.25 + 0.4 * rnd(fr + i * 9) }))
  return (
    <div className="th-film" style={{ opacity: k }}>
      <svg width={QUIZ_W} height={QUIZ_H}>
        <filter id={`g${fr}`}><feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed={fr % 97} /><feColorMatrix values="0 0 0 0 0.25  0 0 0 0 0.18  0 0 0 0 0.1  0 0 0 0.55 0" /></filter>
        <rect width="100%" height="100%" filter={`url(#g${fr})`} />
        {lines.map((l, i) => <line key={i} x1={l.x} x2={l.x + 3} y1="0" y2={QUIZ_H} stroke="#F4E6C8" strokeWidth="1.2" opacity={l.o} />)}
      </svg>
      <div className="th-burn" />
    </div>
  )
}

export function TheoryClip({ c, t, footage }) {
  const body = bodyDur(c)
  if (t >= body) return (
    <div className="tr qz" style={{ width: QUIZ_W, height: QUIZ_H }}>
      <EndCard t={t - body} />
      <div className="tr-vignette" />
    </div>
  )
  const ft = footTime(c, t)
  const tw = segStart(c, c.twist), mate = segStart(c, 6)
  const old = 1 - prog(t, tw, tw + 0.35) // 1 = sepia film, 0 = colour
  const flick = old > 0 ? (rnd(Math.floor(t * 12)) - 0.5) * 0.08 : 0
  const bonkT = at(c, c.stamp.seg, c.stamp.ft)

  // camera: slow push through the theory, punch on the mate, shake on BONK
  let zoom = lerp(1, 1.06, easeOut(prog(t, 0, mate)))
  zoom += 0.06 * backOut(prog(t, mate, mate + 0.25)) * (1 - prog(t, tw - 0.2, tw + 0.2))
  let [sx, sy] = shake(t, bonkT, 0.45, 12)
  // the twist: a short glitch jolt
  const gl = t >= tw - 0.05 && t < tw + 0.3
  if (gl) sx += (rnd(Math.floor(t * 30)) - 0.5) * 26
  const [b0, b1] = c.board
  const filter = `sepia(${0.95 * old}) saturate(${1 - 0.35 * old}) contrast(${1 + 0.12 * old}) brightness(${1 + flick})`

  const arrows = c.arrows.filter(([, , , a, b]) => t >= atSpec(c, a) && t < atSpec(c, b) + 0.15)
  const note = [...c.notes].reverse().find(([i, f]) => t >= at(c, i, f))
  const noteT = note ? at(c, note[0], note[1]) : 0
  const serif = old > 0.5

  return (
    <div className="tr qz" style={{ width: QUIZ_W, height: QUIZ_H }}>
      <div className="th-stage" style={{ filter }}>
        <div className="qz-bg" />
        {t >= bonkT && (
          <div className="tr-burst" style={{ '--c': c.color, top: DY - 40, opacity: 1 - prog(t, bonkT + 0.6, bonkT + 1.4), transform: `rotate(${(t - bonkT) * 30}deg)` }} />
        )}
        <video data-src={c.src} data-time={ft.toFixed(4)} src={`${footage}${c.src}.mp4`} muted playsInline preload="auto" className="cl-video"
          style={{ top: DY - c.cy, clipPath: `inset(${b0}px 0 ${768 - b1}px 0 round 14px)`, transformOrigin: `50% ${c.cy}px`, transform: `translate(${sx}px, ${sy}px) scale(${zoom})` }} />
        <svg className="qz-arrow" width={QUIZ_W} height={QUIZ_H} style={{ transformOrigin: `50% ${DY}px`, transform: `translate(${sx}px, ${sy}px) scale(${zoom})` }}>
          {arrows.map(([from, to, col, a, b], i) => {
            const t0 = atSpec(c, a), p = easeOut(prog(t, t0, t0 + 0.35)), o = 1 - prog(t, atSpec(c, b), atSpec(c, b) + 0.15)
            const [x1, y1] = sq(from), [tx, ty] = sq(to)
            const len = Math.hypot(tx - x1, ty - y1), cut = 18 / len // the head ends on the square's centre
            const x2 = tx - (tx - x1) * cut, y2 = ty - (ty - y1) * cut
            const id = `ah${i}`
            return (
              <g key={i} opacity={0.88 * o}>
                <defs><marker id={id} markerWidth="3.2" markerHeight="3.2" refX="1.4" refY="1.6" orient="auto"><path d="M0,0 L3.2,1.6 L0,3.2 Z" fill={col} /></marker></defs>
                <line x1={x1} y1={y1 - c.cy + DY} x2={lerp(x1, x2, p)} y2={lerp(y1, y2, p) - c.cy + DY}
                  stroke={col} strokeWidth="11" strokeLinecap="round" markerEnd={`url(#${id})`} />
              </g>
            )
          })}
        </svg>
        <Film t={t} k={old} />
      </div>

      {/* book notation under the board */}
      {note && (
        <div key={note[2]} className={`th-note${serif ? ' th-serif' : ''}`} style={{ top: DY + (b1 - c.cy) + 22, transform: `translateX(-50%) scale(${lerp(1.4, 1, backOut(prog(t, noteT, noteT + 0.18), 2.4))})`, opacity: prog(t, noteT, noteT + 0.05) }}>
          {note[2]}
          <small>{note[3]}</small>
        </div>
      )}

      {/* words */}
      {t < at(c, 1, 2.0) && (
        <>
          <div className="qz-kicker th-kicker" style={{ opacity: prog(t, 0, 0.15) }}><span>{c.kicker}</span></div>
          <Words t={t} t0={0.25} lines={c.title} y={108} size={30} hl={[1]} out={at(c, 1, 1.85)} />
          <div className="th-sub" style={{ opacity: prog(t, 1.0, 1.2) * (1 - prog(t, at(c, 1, 1.85), at(c, 1, 2.0))) }}>{c.sub}</div>
        </>
      )}
      {t >= mate && t < tw && (
        <>
          <Stamp t={t} t0={mate + 0.1} text={c.mateStamp} color="#F2B544" y={DY} size={46} life={1.5} />
          <Words t={t} t0={mate + 0.7} lines={c.mated} y={118} size={34} out={tw - 0.15} />
        </>
      )}
      {t >= tw && t < segStart(c, 8) && <Words t={t} t0={tw + 0.15} lines={c.but} y={100} size={44} hl={[1]} />}
      {t >= segStart(c, 8) && t < segStart(c, 10) && <Words t={t} t0={segStart(c, 8)} lines={c.doing} y={100} size={40} hl={[1]} />}
      {t >= segStart(c, 10) && t < bonkT && <Words t={t} t0={segStart(c, 10) + 0.1} lines={c.casual} y={118} size={36} />}
      {t >= segStart(c, 13) && <Words t={t} t0={segStart(c, 13) + 0.05} lines={c.punch} y={92} size={29} hl={[1]} />}
      <Stamp t={t} t0={bonkT} text={c.stamp.text} color={c.color} y={DY - 60} size={74} life={1.4} />

      <div className="tr-flash" style={{ opacity: 0.9 * Math.max(0, 1 - Math.abs(t - tw) / 0.16) + 0.35 * Math.max(0, 1 - Math.abs(t - bonkT) / 0.1) }} />
      {gl && <div className="th-glitch" style={{ top: rnd(Math.floor(t * 30)) * 600, height: 30 + rnd(Math.floor(t * 30) + 5) * 90 }} />}
      <div className="cl-mark">mischess.com</div>
      <div className="tr-vignette" style={{ boxShadow: `inset 0 0 ${120 + 80 * old}px rgba(0,0,0,${0.55 + 0.25 * old})` }} />
    </div>
  )
}
