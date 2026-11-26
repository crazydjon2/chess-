import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import '../theme/tokens.css'
import '../theme/base.css'
import { SkinProvider } from '../skins/SkinContext'
import Trailer, { DURATION, SOURCES as TRAILER_SOURCES } from './Trailer'
import { Clip, CLIPS, clipDuration } from './Clips'
import { quizSfx } from './Quiz'
import { theorySfx } from './Theory'

// window.__seek(t): render the frame at time t (seconds) — videos seeked,
// DOM updated, two frames painted — then resolve. Driven by
// tools/trailer/render.mjs, which screenshots after each call.
const params = new URLSearchParams(location.search)
const footage = params.get('footage') // URL prefix of tools/trailer/footage/
const clip = params.get('clip')       // ?clip=meteor → a Reddit clip (Clips.jsx) instead of the trailer
const SOURCES = clip ? [CLIPS[clip].src] : TRAILER_SOURCES

const root = createRoot(document.getElementById('root'))
let current = 0
function draw(t) {
  flushSync(() => root.render(<SkinProvider>{clip ? <Clip id={clip} t={t} footage={footage} /> : <Trailer t={t} footage={footage} />}</SkinProvider>))
}

window.__duration = clip ? clipDuration(CLIPS[clip]) : DURATION
window.__sfx = !clip ? null : CLIPS[clip].quiz ? quizSfx(CLIPS[clip].quiz) : CLIPS[clip].theory ? theorySfx(CLIPS[clip].theory) : null // sound cues → clips.mjs
window.__seek = async (t) => {
  current = t
  draw(t)
  const vids = [...document.querySelectorAll('video[data-src]')]
  await Promise.all(vids.map(v => {
    const want = Number(v.dataset.time)
    if (!Number.isFinite(want) || Math.abs(v.currentTime - want) < 1e-3) return null
    return new Promise(res => { v.addEventListener('seeked', res, { once: true }); v.currentTime = want })
  }))
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))
}
window.__ready = (async () => {
  draw(0)
  await document.fonts.ready
  // wait for every source to be decodable before frame 0
  await Promise.all(SOURCES.map(id => new Promise(res => {
    const v = document.querySelector(`video[data-src="${id}"]`)
    if (!v || v.readyState >= 2) return res()
    v.addEventListener('loadeddata', res, { once: true })
  })))
  return true
})()
