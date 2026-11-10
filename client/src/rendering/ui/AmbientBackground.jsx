import { useLayoutEffect, useRef } from 'react'
import { isAmbientOn } from './ambientPref'
import './AmbientBackground.css'

// Living backdrop: smoke that churns chaotically IN PLACE (folded
// coordinates, the Balatro-menu idea) in the theme's background tones — no
// rotation or drift of the whole picture. Kept calm: low contrast, drawn at a
// fraction of the screen resolution (it's all soft gradients anyway) and
// capped at 30 fps; paused in background tabs, a single still frame for
// prefers-reduced-motion. Colors are tokens (--smoke-*), re-read on theme
// change; without WebGL the static CSS gradient underneath stays.
const VERT = `attribute vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }`
const FRAG = `
precision mediump float;
uniform vec2 uRes;
uniform float uTime;
uniform float uSpeed;
uniform vec3 uC0, uC1, uC2;
void main() {
  // No global motion at all — nothing rotates, pans or zooms (that reads as
  // the whole screen moving and is hard on the eyes). Only the folding
  // below changes with time, each fold at its own pace, so the smoke
  // churns chaotically in place.
  float t = uTime * uSpeed;
  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / length(uRes);
  float len = length(uv);
  float ang = atan(uv.y, uv.x) - 2.2 * len;       // fixed twist, never animated
  uv = vec2(cos(ang), sin(ang)) * len * 22.0;
  vec2 uv2 = vec2(uv.x + uv.y);
  for (int i = 0; i < 5; i++) {
    float fi = float(i);
    float ta = t * (0.045 + 0.013 * fi);            // incommensurate per-fold speeds
    float tb = t * (0.037 + 0.011 * fi);
    uv2 += sin(max(uv.x, uv.y)) + uv;
    uv += 0.5 * vec2(cos(5.11 + 0.353 * uv2.y + ta + fi), sin(uv2.x - tb + fi * 1.3));
    uv -= cos(uv.x + uv.y) - sin(uv.x * 0.711 - uv.y);
  }
  float d = clamp(length(uv) * 0.035 * 1.35, 0.0, 2.0);
  float k1 = max(0.0, 1.0 - 1.35 * abs(1.0 - d));
  float k2 = max(0.0, 1.0 - 1.35 * abs(d));
  float k0 = 1.0 - min(1.0, k1 + k2);
  vec3 col = k0 * uC0 + k1 * uC1 + k2 * uC2;
  col *= 1.0 - 0.25 * smoothstep(0.25, 0.75, len);
  gl_FragColor = vec4(col, 1.0);
}`

const SCALE = 0.33 // render resolution vs CSS pixels
// How lively the churning is (1 = very subtle). Only shapes change — the
// picture as a whole never rotates or moves.
const SPEED = 1.5
const FPS = 30

function cssColor(el, name, fallback) {
  const v = getComputedStyle(el).getPropertyValue(name).trim() || fallback
  const m = v.match(/^#([0-9a-f]{6})$/i)
  if (!m) return [0.23, 0.16, 0.14]
  const n = parseInt(m[1], 16)
  return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]
}

export default function AmbientBackground() {
  const ref = useRef(null)
  // Layout effect: the first frame is drawn before the browser paints, so
  // the smoke is there from the very first frame.
  useLayoutEffect(() => {
    const canvas = ref.current
    const fallback = () => document.documentElement.classList.add('no-ambient')
    const gl = canvas?.getContext('webgl', { antialias: false, alpha: false, preserveDrawingBuffer: false, powerPreference: 'low-power' })
    if (!gl) { fallback(); return }
    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s }
    const prog = gl.createProgram()
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT))
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG))
    gl.linkProgram(prog)
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { fallback(); return }
    gl.useProgram(prog)
    const buf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
    const loc = gl.getAttribLocation(prog, 'p')
    gl.enableVertexAttribArray(loc)
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0)
    const uRes = gl.getUniformLocation(prog, 'uRes')
    const uTime = gl.getUniformLocation(prog, 'uTime')
    gl.uniform1f(gl.getUniformLocation(prog, 'uSpeed'), SPEED)
    const uC = [0, 1, 2].map(i => gl.getUniformLocation(prog, `uC${i}`))

    const setColors = () => {
      const root = document.documentElement
      gl.uniform3fv(uC[0], cssColor(root, '--smoke-0', '#33241F'))
      gl.uniform3fv(uC[1], cssColor(root, '--smoke-1', '#4A3830'))
      gl.uniform3fv(uC[2], cssColor(root, '--smoke-2', '#5A4130'))
    }
    const resize = () => {
      const w = Math.max(1, Math.round(window.innerWidth * SCALE))
      const h = Math.max(1, Math.round(window.innerHeight * SCALE))
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h }
      gl.viewport(0, 0, w, h)
      gl.uniform2f(uRes, w, h)
    }
    setColors()
    resize()

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let still = reduced || !isAmbientOn()
    const start = performance.now() - Math.random() * 60000 // don't start every visit on the same frame
    let raf = 0, last = 0
    const draw = (now) => {
      gl.uniform1f(uTime, (now - start) / 1000)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
    }
    const loop = (now) => {
      raf = requestAnimationFrame(loop)
      if (now - last < 1000 / FPS) return
      last = now
      draw(now)
    }
    const startLoop = () => { if (!raf && !still && !document.hidden) raf = requestAnimationFrame(loop) }
    const stopLoop = () => { cancelAnimationFrame(raf); raf = 0 }
    const onVis = () => (document.hidden ? stopLoop() : startLoop())
    const onResize = () => { resize(); if (still || document.hidden) draw(performance.now()) }
    const onTheme = () => { setColors(); if (still) draw(performance.now()) }

    draw(performance.now())
    startLoop()
    window.addEventListener('resize', onResize)
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('chessplus:theme', onTheme)
    // Settings toggle: stop on the current frame / resume from it.
    const onPref = () => { still = reduced || !isAmbientOn(); if (still) stopLoop(); else startLoop() }
    window.addEventListener('chessplus:ambient', onPref)
    return () => {
      window.removeEventListener('chessplus:ambient', onPref)
      stopLoop()
      window.removeEventListener('resize', onResize)
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('chessplus:theme', onTheme)
      gl.getExtension('WEBGL_lose_context')?.loseContext()
    }
  }, [])
  return <canvas ref={ref} className="ambient-bg" aria-hidden="true" />
}
