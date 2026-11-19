// 9:16 meme quizzes: a classic chess question → the "obvious" answer gets a
// red WRONG → the card answer. Pure function of time t, like Clips.jsx;
// registered in CLIPS (Clips.jsx) so tools/trailer/clips.mjs renders them.
// Footage: tools/trailer/shots.mjs (432×768 logical). All footage coords
// below are in that space.
import { CardIcon } from '../skins/Piece'

export const QUIZ_W = 432, QUIZ_H = 768

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

export const QUIZZES = {
  backrank: {
    src: 'backrank', color: '#9BC46A',
    still: 0.6, // footage frame shown until the card is played
    board: [192, 578], // footage y-range of the board (the only thing shown at first)
    hand: [['barricade', 'Stone'], ['meteor', 'Meteor'], ['shield', 'Shield']],
    pick: 0, desc: 'a wall with 2 HP', // the answer card in `hand`
    threat: [[66, 505], [292, 505]], // red arrow: the rook's line to the king
    kicker: 'white to move',
    q: ['how do you stop', 'back rank mate?'],
    obvious: 'make luft?',
    reveal: ['we have', 'cards.'],
    doing: ['put a rock', 'there.'],
    punch: ["we don't do", 'back rank mates', 'here.'],
    punchAt: 5.3, // footage time
    stamp: { at: 5.05, text: 'CLONK!' },
    // after the reveal: footage [from, to, clip seconds] — slow-mo on the hit
    play: [[2.2, 4.0, 1.5], [4.0, 4.7, 0.55], [4.7, 5.35, 1.5], [5.35, 7.4, 2.1]],
  },
}

// timeline (clip seconds)
const THINK0 = 2.0, THINK = 3, OBV = THINK0 + THINK, WRONG = OBV + 0.75
const REVEAL = WRONG + 1.25, HAND = REVEAL + 0.3, HILITE = HAND + 0.7, PLAY = HILITE + 1.6
const END = 1.5
const DY = 470 - 385 // board centre (footage y≈385) sits at canvas y 470

const playDur = c => c.play.reduce((s, x) => s + x[2], 0)
export const quizDuration = c => PLAY + playDur(c) + END

// clip time at which footage time `ft` is shown (inverse of footTime)
function clipTimeOf(c, ft) {
  let t = PLAY
  for (const [a, b, d] of c.play) {
    if (ft <= b) return t + d * clamp((ft - a) / (b - a))
    t += d
  }
  return t
}

// Sound cues, mixed in by tools/trailer/clips.mjs. f = file under
// tools/trailer/sfx (see sfx/LICENSES.md), v = gain, ss/dur = trim (s).
const S = {
  whoosh: 'pixabay/dragon-studio-simple-whoosh-382724.mp3',
  ticking: 'pixabay/dragon-studio-clock-ticking-down-376897.mp3',
  buzzer: 'pixabay/eritnhut1992-buzzer-or-wrong-answer-20582.mp3',
  correct: 'pixabay/dragon-studio-correct-472358.mp3',
  boulder: 'pixabay/dragon-studio-boulder-impact-487673.mp3',
  mining: 'kenney/impact/Audio/impactMining_000.ogg',
  tick: 'kenney/interface/Audio/tick_001.ogg',
  pop: 'kenney/interface/Audio/pluck_002.ogg',
  pop2: 'kenney/interface/Audio/pluck_001.ogg',
  question: 'kenney/interface/Audio/question_001.ogg',
  card: 'kenney/interface/Audio/select_002.ogg',
  confirm: 'kenney/interface/Audio/confirmation_002.ogg',
  drop: 'kenney/interface/Audio/drop_002.ogg',
}
export function quizSfx(c) {
  const end = PLAY + playDur(c)
  return [
    { t: 0.4, f: S.whoosh, v: 0.35 },
    { t: THINK0 - 0.2, f: S.pop, v: 1 },
    { t: THINK0, f: S.ticking, v: 7, ss: 0.04, dur: THINK },
    ...[0, 1, 2].map(k => ({ t: THINK0 + k, f: S.tick, v: k === 2 ? 1.8 : 1.2 })),
    { t: OBV, f: S.question, v: 0.5 },
    { t: WRONG, f: S.buzzer, v: 0.4 },
    { t: REVEAL, f: S.whoosh, v: 0.7 },
    ...c.hand.map((_, i) => ({ t: HAND + i * 0.12, f: S.card, v: 0.8 })),
    { t: HILITE, f: S.correct, v: 0.6 },
    { t: PLAY, f: S.whoosh, v: 0.5 },
    { t: clipTimeOf(c, 2.7), f: S.confirm, v: 0.5 },
    { t: clipTimeOf(c, 4.05), f: S.drop, v: 0.8 },
    { t: clipTimeOf(c, c.stamp.at) - 0.03, f: S.boulder, v: 0.9 },
    { t: clipTimeOf(c, c.stamp.at) - 0.03, f: S.mining, v: 1 },
    { t: clipTimeOf(c, c.punchAt), f: S.pop2, v: 0.7 },
    { t: end, f: S.whoosh, v: 0.5 },
    { t: end + 0.15, f: S.confirm, v: 0.5 },
  ]
}

function footTime(c, t) {
  if (t < PLAY) return c.still
  let tt = t - PLAY
  for (const [a, b, d] of c.play) {
    if (tt <= d) return a + (b - a) * (tt / d)
    tt -= d
  }
  return c.play.at(-1)[1]
}

// Big outlined words, popping in one line after another (no boxes).
function Words({ t, t0, lines, y, size = 34, hl = [], dim = 0, out }) {
  const o = out == null ? 1 : 1 - prog(t, out, out + 0.15)
  return (
    <div className="qz-words" style={{ top: y, fontSize: size, opacity: o * (1 - dim) }}>
      {lines.map((l, i) => {
        const p = backOut(prog(t, t0 + i * 0.22, t0 + i * 0.22 + 0.2), 2.4)
        return (
          <div key={i} className={hl.includes(i) ? 'qz-hl' : ''} style={{ opacity: prog(t, t0 + i * 0.22, t0 + i * 0.22 + 0.05), transform: `scale(${lerp(1.35, 1, p)})` }}>
            {l}
          </div>
        )
      })}
    </div>
  )
}

function Stamp({ t, t0, text, color, y, size, rot = -7, life = 1.4 }) {
  const lt = t - t0
  if (lt < 0) return null
  const p = backOut(prog(lt, 0, 0.16), 2.6)
  return (
    <div className="tr-stamp" style={{ left: '50%', top: y, color, fontSize: size, opacity: prog(lt, 0, 0.05) * (1 - easeIn(prog(lt, life, life + 0.2))), transform: `translate(-50%, -50%) rotate(${rot}deg) scale(${lerp(3.2, 1, p)})` }}>
      {text}
    </div>
  )
}

// Stopwatch: ring drains over THINK seconds, the digit pops each second.
function Timer({ t }) {
  const lt = t - THINK0
  if (lt < -0.2 || t > OBV + 0.25) return null
  const appear = backOut(prog(lt, -0.2, 0.1), 2)
  const gone = easeIn(prog(t, OBV, OBV + 0.25))
  const left = clamp(1 - lt / THINK)
  const sec = Math.min(3, Math.max(1, Math.ceil(THINK - lt)))
  const tick = lt - Math.floor(lt) // 0..1 inside the current second
  const pop = backOut(prog(tick, 0, 0.18), 3)
  const wob = Math.sin(clamp(tick / 0.3) * Math.PI) * (Math.floor(lt) % 2 ? 7 : -7)
  const R = 62, C = 2 * Math.PI * R
  return (
    <div className="qz-timer" style={{ opacity: 1 - gone, transform: `translate(-50%, -50%) scale(${0.62 * appear * (1 - 0.4 * gone)}) rotate(${wob}deg)` }}>
      <svg width="170" height="190" viewBox="-85 -100 170 190">
        <rect x="-14" y="-96" width="28" height="16" rx="5" fill="#F2B544" stroke="#16141F" strokeWidth="4" />
        <rect x="46" y="-80" width="16" height="12" rx="4" fill="#F2B544" stroke="#16141F" strokeWidth="4" transform="rotate(40)" />
        <circle r="78" fill="#FFF6E8" stroke="#16141F" strokeWidth="7" />
        <circle r={R} fill="none" stroke="#E9DCCB" strokeWidth="16" />
        <circle r={R} fill="none" stroke="#FF4A3D" strokeWidth="16" strokeLinecap="round"
          strokeDasharray={C} strokeDashoffset={C * (1 - left)} transform="rotate(-90)" />
      </svg>
      <b style={{ transform: `translate(-50%, -50%) scale(${lerp(1.6, 1, pop)})` }}>{sec}</b>
    </div>
  )
}

function EndCard({ t }) {
  const p = backOut(prog(t, 0, 0.22), 2)
  return (
    <div className="tr-title">
      <div className="tr-end" style={{ transform: `scale(${lerp(2, 1, p) * (1 + 0.015 * Math.sin(t * 4))})` }}>
        <div className="tr-logo"><b>MIS</b>CHESS</div>
        <div className="tr-url" style={{ opacity: prog(t, 0.25, 0.4) }}>mischess.com</div>
        <div className="cl-free" style={{ opacity: prog(t, 0.45, 0.6) }}>free · 1v1 · in your browser</div>
      </div>
    </div>
  )
}

export function QuizClip({ c, t, footage }) {
  const ft = footTime(c, t)
  const end = t >= PLAY + playDur(c)
  if (end) return (
    <div className="tr qz" style={{ width: QUIZ_W, height: QUIZ_H }}>
      <EndCard t={t - PLAY - playDur(c)} />
      <div className="tr-vignette" />
    </div>
  )

  const playing = t >= PLAY
  // camera: slow push during the question; shakes on WRONG and on the stamp
  const push = playing ? lerp(1.05, 1, easeOut(prog(t, PLAY, PLAY + 0.4))) : lerp(1, 1.05, easeOut(prog(t, 0, REVEAL)))
  let [sx, sy] = shake(t, WRONG, 0.45, 11)
  if (playing) [sx, sy] = shake(ft, c.stamp.at, 0.4, 12)
  const vidStyle = (top, bottom) => ({
    top: DY, clipPath: `inset(${top}px 0 ${768 - bottom}px 0 round 14px)`,
    transformOrigin: `50% 385px`, transform: `translate(${sx}px, ${sy}px) scale(${push})`,
  })
  const video = (key, style) => (
    <video key={key} data-src={c.src} data-time={ft.toFixed(4)} src={`${footage}${c.src}.mp4`}
      muted playsInline preload="auto" className="cl-video" style={style} />
  )

  // the hand: big cards over the dimmed board; the answer card lights up
  const handOut = easeIn(prog(t, PLAY - 0.25, PLAY))
  const hl = prog(t, HILITE, HILITE + 0.2)
  const pulse = 1 + 0.06 * Math.sin((t - HILITE) * 9)
  const boardY0 = DY + c.board[0], boardY1 = DY + c.board[1]
  const dark = Math.max(
    0.28 * prog(t, THINK0 - 0.2, THINK0 + 0.1) * (1 - prog(t, OBV, OBV + 0.3)),
    0.6 * prog(t, HAND - 0.2, HAND) * (1 - prog(t, PLAY - 0.25, PLAY)),
  )
  const [[ax, ay], [bx, by]] = c.threat
  const arrow = prog(t, 0.4, 0.75) * (1 - prog(t, REVEAL, REVEAL + 0.2))
  const flashW = Math.max(0, 1 - Math.abs(t - WRONG - 0.04) / 0.22)
  const flashS = playing ? Math.max(0, 1 - Math.abs(ft - c.stamp.at) / 0.1) : 0

  return (
    <div className="tr qz" style={{ width: QUIZ_W, height: QUIZ_H }}>
      <div className="qz-bg" />
      {playing && ft >= c.stamp.at && (
        <div className="tr-burst" style={{ '--c': c.color, top: boardY0 + 150, opacity: 1 - prog(ft, c.stamp.at + 0.5, c.stamp.at + 1.2), transform: `rotate(${(ft - c.stamp.at) * 30}deg)` }} />
      )}
      {video('board', vidStyle(c.board[0], c.board[1]))}

      {/* the threat: red arrow along the back rank */}
      <svg className="qz-arrow" width={QUIZ_W} height={QUIZ_H} style={{ opacity: arrow }}>
        <defs><marker id="qzh" markerWidth="5" markerHeight="5" refX="2.6" refY="2.5" orient="auto"><path d="M0,0 L5,2.5 L0,5 Z" fill="#FF4A3D" /></marker></defs>
        <line x1={ax} y1={ay + DY} x2={lerp(ax, bx, easeOut(prog(t, 0.4, 0.9)))} y2={by + DY}
          stroke="#FF4A3D" strokeWidth="9" strokeLinecap="round" markerEnd="url(#qzh)" strokeDasharray="2 16"
          strokeDashoffset={-t * 40} style={{ filter: 'drop-shadow(0 0 6px rgba(255,74,61,0.8))' }} />
      </svg>

      {/* think: dim the board, stopwatch on top */}
      <div className="qz-dim" style={{ top: boardY0, height: boardY1 - boardY0, opacity: dark }} />
      <Timer t={t} />

      {/* the hand: cards fly in, the answer card lights up */}
      {t >= HAND && t < PLAY && (
        <div className="qz-hand" style={{ opacity: 1 - handOut, transform: `translateY(${-30 * handOut}px)` }}>
          {c.hand.map(([id, name], i) => {
            const pin = backOut(prog(t, HAND + i * 0.12, HAND + i * 0.12 + 0.3), 2)
            const me = i === c.pick
            const s = me ? lerp(1, 1.22, easeOut(hl)) * (hl ? pulse : 1) : lerp(1, 0.86, hl)
            return (
              <div key={id} className={`qz-card${me ? ' qz-pick' : ''}`} style={{
                opacity: prog(t, HAND + i * 0.12, HAND + i * 0.12 + 0.08) * (me ? 1 : 1 - 0.65 * hl),
                transform: `translateY(${lerp(140, 0, pin)}px) rotate(${(i - 1) * 6 * (1 - hl * (me ? 1 : 0))}deg) scale(${s})`,
                '--c': c.color, '--g': me ? hl : 0,
              }}>
                <CardIcon id={id} size={92} radius={18} iconScale={0.62} />
                <span>{name}</span>
              </div>
            )
          })}
          <div className="qz-desc" style={{ opacity: hl, transform: `translateY(${lerp(14, 0, easeOut(hl))}px)` }}>{c.desc}</div>
        </div>
      )}

      {/* words */}
      {t < REVEAL && (
        <>
          <div className="qz-kicker" style={{ opacity: prog(t, -1, 0) * (1 - 0.6 * prog(t, OBV, OBV + 0.2)) }}>{c.kicker}</div>
          <Words t={t} t0={-1} lines={c.q} y={98} size={30} hl={[1]} dim={0.6 * prog(t, OBV, OBV + 0.2)} />
        </>
      )}
      {t >= OBV && t < REVEAL && (
        <div className="qz-obvious" style={{ opacity: 1 - prog(t, REVEAL - 0.15, REVEAL) }}>
          <span style={{ transform: `scale(${lerp(1.6, 1, backOut(prog(t, OBV, OBV + 0.18), 2.4))})` }}>{c.obvious}</span>
          <i style={{ transform: `scaleX(${easeOut(prog(t, OBV + 0.25, WRONG - 0.02))})` }} />
        </div>
      )}
      {t >= WRONG && t < REVEAL + 0.1 && <Stamp t={t} t0={WRONG} text="WRONG" color="#FF4A3D" y={470} size={78} life={1.05} />}
      {t >= REVEAL && !playing && <Words t={t} t0={REVEAL} lines={c.reveal} y={92} size={40} hl={[1]} />}
      {playing && ft < c.punchAt && <Words t={t} t0={PLAY} lines={c.doing} y={92} size={40} hl={[1]} />}
      {playing && ft >= c.punchAt && <Words t={ft} t0={c.punchAt} lines={c.punch} y={74} size={30} hl={[1]} />}
      {playing && <Stamp t={ft} t0={c.stamp.at} text={c.stamp.text} color={c.color} y={boardY0 + 140} size={70} life={1.3} />}

      <div className="qz-flash" style={{ background: '#FF2A1A', opacity: 0.5 * flashW }} />
      <div className="tr-flash" style={{ opacity: 0.35 * flashS }} />
      <div className="cl-mark">mischess.com</div>
      <div className="tr-vignette" />
    </div>
  )
}
