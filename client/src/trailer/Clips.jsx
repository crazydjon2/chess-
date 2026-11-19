// Short looping clips for Reddit posts (4:5, one card moment each), a pure
// function of time t like Trailer.jsx. Rendered by tools/trailer/clips.mjs.
// Footage: tools/trailer/capture.mjs (432×768 logical, 9:16); `from`/`to`
// and every `at` below are seconds in that footage.
import { CardIcon } from '../skins/Piece'
import { QUIZZES, QUIZ_H, QuizClip, quizDuration } from './Quiz'
import './trailer.css'

export const CLIP_W = 432, CLIP_H = 540
const END = 1.4 // end card length

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

// cy: footage y (logical px of 768) kept at the clip's centre; zoom ramps
// from z0 to z1 over the clip, toward `focus` (footage px).
export const CLIPS = {
  meteor: {
    src: 'meteor', from: 1.0, to: 7.4, card: 'meteor',
    title: 'METEOR', sub: 'lands 2 turns later', color: '#F26B3A',
    stamp: { at: 5.9, text: 'BONK!', flash: true }, cy: 330, z0: 1, z1: 1.06,
  },
  freeze: {
    src: 'freeze', from: 1.0, to: 7.0, card: 'freeze',
    title: 'FREEZE MINE', sub: 'invisible. they walked right in', color: '#7CC6E0',
    stamp: { at: 3.75, text: 'FROZEN!' }, cy: 330, z0: 1, z1: 1.06,
  },
  shield: {
    src: 'shield', from: 1.0, to: 7.0, card: 'shield',
    title: 'SHIELD', sub: 'the queen bounces off', color: '#8FA2FF',
    stamp: { at: 3.9, text: 'BOUNCE!' }, cy: 330, z0: 1, z1: 1.06,
  },
  unstable: {
    src: 'unstable', from: 1.0, to: 6.8, card: 'unstable',
    title: 'UNSTABLE', sub: 'their queen keeps mutating', color: '#C69BEA',
    stamp: { at: 3.0, text: 'WHAT?!' }, cy: 330, z0: 1, z1: 1.06,
  },
  stone: {
    src: 'stone', from: 1.0, to: 6.0, card: 'barricade',
    title: 'STONE', sub: 'the rook bounces off', color: '#9BC46A',
    stamp: { at: 3.8, text: 'CLONK!' }, cy: 330, z0: 1, z1: 1.06,
  },

  // 9:16 meme quizzes (Quiz.jsx)
  ...Object.fromEntries(Object.entries(QUIZZES).map(([id, q]) => [id, { src: q.src, h: QUIZ_H, quiz: q }])),
}
export const clipDuration = c => c.quiz ? quizDuration(c.quiz) : (c.to - c.from) / (c.speed ?? 1) + END

function Stamp({ t, t0, text, color }) {
  const lt = t - t0
  if (lt < 0) return null
  const p = backOut(prog(lt, 0, 0.16), 2.6)
  const out = easeIn(prog(lt, 1.1, 1.3))
  return (
    <div className="tr-stamp" style={{ left: '50%', top: '31%', color, fontSize: 52, opacity: prog(lt, 0, 0.05) * (1 - out), transform: `translate(-50%, -50%) rotate(-6deg) scale(${lerp(3, 1, p)})` }}>
      {text}
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

export function Clip({ id, t, footage }) {
  const c = CLIPS[id]
  if (c.quiz) return <QuizClip c={c.quiz} t={t} footage={footage} />
  const body = (c.to - c.from) / (c.speed ?? 1)
  const ft = Math.min(c.to, c.from + t * (c.speed ?? 1)) // footage time
  const zoom = lerp(c.z0, c.z1, easeOut(prog(t, 0, body)))
  const [sx, sy] = c.stamp ? shake(ft, c.stamp.at, 0.35, 8) : [0, 0]
  const end = t >= body
  return (
    <div className="tr cl" style={{ width: CLIP_W, height: CLIP_H }}>
      <video
        data-src={c.src}
        data-time={ft.toFixed(4)}
        src={`${footage}${c.src}.mp4`}
        muted playsInline preload="auto"
        className="cl-video"
        style={{ top: CLIP_H / 2 - c.cy, transformOrigin: `50% ${c.cy}px`, transform: `translate(${sx}px, ${sy}px) scale(${zoom})` }}
      />
      {!end && (
        <>
          <div className="cl-head" style={{ '--c': c.color }}>
            <div className="cl-head-row">
              {c.card && <CardIcon id={c.card} size={40} radius={9} iconScale={0.58} />}
              <b>{c.title}</b>
            </div>
            <span>{c.sub}</span>
          </div>
          {c.stamp && <Stamp t={ft} t0={c.stamp.at} text={c.stamp.text} color={c.color} />}
          <div className="cl-mark">mischess.com</div>
          {c.stamp?.flash && <div className="tr-flash" style={{ opacity: 0.85 * Math.max(0, 1 - Math.abs(ft - c.stamp.at) / 0.12) }} />}
        </>
      )}
      {end && <EndCard t={t - body} />}
      <div className="tr-vignette" />
    </div>
  )
}
