// Game audio — low-latency Web Audio playback.
//
// Files are fetched and decoded into AudioBuffers ONCE (warmed up on the
// first pointer interaction, see the bottom of this file); play() then
// just fires a BufferSourceNode, which starts on the next audio callback
// (~a few ms). The previous implementation cloned an <audio> element per
// play — that re-span-up the whole media pipeline every time and was the
// audible "delay before the sound".
//
// To add sounds:
//   1. Drop audio files (wav/mp3/ogg) into client/public/sounds/
//   2. Map them in SOUND_FILES below.
// Unregistered names simply no-op, so partial sound sets are fine.
//
// Where each event fires:
//   click    — ANY UI/chrome button (a global delegated listener, see
//              installButtonClicks — covers icon-only buttons and any
//              future button automatically; game-action buttons that have
//              their own sound are excluded via NO_CLICK_SFX)
//   select   — picking up your own piece / clicking it back; selecting or
//              cancelling a card; picking/removing a piece in placement
//   move     — a plain move landing (both players, online + sandbox);
//              placing a piece onto the setup board
//   get      — YOU captured an enemy piece
//   lost     — an enemy captured one of YOUR pieces
//   card     — a card was actually played (applied to a target)
//   buy      — a draft purchase (piece or card)
//   win/lose — you won / lost the round (RoundSummary) or the match
//   yourTurn — the opponent just acted and it's now your move
const SOUND_FILES = {
  select: '/sounds/select.wav',
  move:   '/sounds/move.wav',
  get:    '/sounds/get.wav',
  lost:   '/sounds/lost.wav',
  win:    '/sounds/win.wav',
  lose:   '/sounds/lose.wav',
  click:  '/sounds/click.wav',
  card:   '/sounds/card.wav',
  buy:    '/sounds/get.wav',
  // yourTurn: '/sounds/your-turn.wav',
}

const MUTE_KEY = 'chessplus_sound_muted'
const VOL_KEY  = 'chessplus_sound_volume'

let muted = (() => {
  try { return localStorage.getItem(MUTE_KEY) === '1' } catch { return false }
})()

export function isMuted() { return muted }
export function setMuted(v) {
  muted = !!v
  try { localStorage.setItem(MUTE_KEY, muted ? '1' : '0') } catch { /* ignore */ }
}

let volume = (() => {
  try {
    const raw = localStorage.getItem(VOL_KEY)
    const n = raw == null ? 0.8 : parseFloat(raw)
    return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0.8
  } catch { return 0.8 }
})()

export function getVolume() { return volume }
export function setVolume(v) {
  volume = Math.min(1, Math.max(0, v))
  try { localStorage.setItem(VOL_KEY, String(volume)) } catch { /* ignore */ }
}

// A soft confirmation blip so tweaking the volume slider is audible at the
// new level — plays a real sound so you hear exactly what you're setting.
export function previewVolume() { play('select') }

// The SFX files are mastered quite quietly, so even volume=1.0 (a plain
// gain of 1.0 = the file's own level) sounded weak. Boost the whole bus
// well above unity and put a fast limiter after it, so quiet sounds come
// up a lot while the occasional louder one is caught instead of clipping
// into distortion.
const OUTPUT_GAIN = 3.0

let ctx = null
let master = null
const buffers = new Map()       // name -> decoded AudioBuffer
const rawBytes = new Map()      // name -> Promise<ArrayBuffer|null>

// Fetch the raw bytes immediately (no AudioContext needed, no autoplay
// concerns) so decoding can start the instant we get a context.
for (const [name, src] of Object.entries(SOUND_FILES)) {
  rawBytes.set(name, fetch(src).then(r => (r.ok ? r.arrayBuffer() : null)).catch(() => null))
}

function ensureCtx() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext
    if (!AC) return null
    ctx = new AC()
    master = ctx.createGain()
    master.gain.value = OUTPUT_GAIN
    // Brick-wall-ish limiter so the boost above never clips harshly.
    const limiter = ctx.createDynamicsCompressor()
    limiter.threshold.value = -3
    limiter.knee.value = 0
    limiter.ratio.value = 20
    limiter.attack.value = 0.003
    limiter.release.value = 0.12
    master.connect(limiter)
    limiter.connect(ctx.destination)
    // Decode everything now that a context exists. decodeAudioData is fine
    // while suspended; only actual playback needs the resume() below.
    for (const [name, p] of rawBytes) {
      p.then(ab => {
        if (!ab) return
        ctx.decodeAudioData(ab.slice(0))
          .then(buf => buffers.set(name, buf))
          .catch(() => {})
      })
    }
  }
  if (ctx.state === 'suspended') ctx.resume()
  return ctx
}

export function play(name) {
  if (muted || !SOUND_FILES[name]) return
  try {
    const c = ensureCtx()
    if (!c) return
    const buf = buffers.get(name)
    if (!buf) return // still decoding (only the very earliest plays, briefly)
    const src = c.createBufferSource()
    src.buffer = buf
    const g = c.createGain()
    g.gain.value = volume
    src.connect(g)
    g.connect(master)
    src.start()
  } catch { /* audio is never worth crashing over */ }
}

// Game-action buttons that already play their OWN sound — the global click
// delegation below must NOT also fire 'click' on these (would double up).
const NO_CLICK_SFX = [
  '.gc-card',       // the shared piece/spell card (draft/placement/hand) -> 'buy'/'select'
  '.pl-cell',       // placement board cells -> 'select'/'move'
  '.card-help-btn', // the "?" tooltip toggle — silent
  '.bl-entry',      // battle-log history rows — silent (noisy)
  '.opp-hand-badge',// opponent hand chips — silent
]

// One document-level listener means EVERY current and future <button>
// (and role="button") gets the click sound, including icon-only ones,
// without threading a play('click') through each onClick by hand.
function installButtonClicks() {
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('button, [role="button"]')
    if (!btn || btn.disabled) return
    if (NO_CLICK_SFX.some(sel => btn.matches(sel) || btn.closest(sel))) return
    play('click')
  }, true)
}

// Warm up (create context + decode) on the first pointer press anywhere,
// so buffers are ready before the user's first meaningful click — and it's
// a real user gesture, so the context is allowed to start.
if (typeof document !== 'undefined') {
  installButtonClicks()
  const warm = () => { ensureCtx(); window.removeEventListener('pointerdown', warm) }
  window.addEventListener('pointerdown', warm, { once: true })
}
