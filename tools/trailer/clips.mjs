// Renders the short Reddit clips (client/src/trailer/Clips.jsx) into
// tools/trailer/out/clips/<id>.mp4 (1080×1350, 30 fps — upload this to
// Reddit, it plays as video) and <id>.gif (540 px, 15 fps — for places that
// want a real GIF: itch.io, Discord, r/WebGames thumbnails).
//   node tools/trailer/clips.mjs                  # all clips
//   node tools/trailer/clips.mjs meteor freeze    # some
//   node tools/trailer/clips.mjs --sheet          # contact sheets (timing check)
//   node tools/trailer/clips.mjs --raw meteor     # sheet of the raw footage, 0.25 s steps
// Footage must exist first: node tools/trailer/capture.mjs
import { chromium } from 'playwright-core'
import path from 'path'
import fs from 'fs'
import { fileURLToPath, pathToFileURL } from 'url'
import { ffmpeg } from './lib/recorder.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '../..')
const CLIENT = path.join(ROOT, 'client')
const OUT = path.join(HERE, 'out', 'clips')
const OUT_SM = path.join(OUT, 'sm') // 9:16 quizzes for TikTok / Reels / Shorts
const FPS = 30, SCALE = 2.5, W = 432, H0 = 540, QUIZ_H = 768
const args = process.argv.slice(2)
const sheetOnly = args.includes('--sheet')
const raw = args.includes('--raw')
const ids = args.filter(a => !a.startsWith('--'))
fs.mkdirSync(OUT_SM, { recursive: true })

if (raw) {
  // the footage itself, every 0.25 s (10 per row: row r, column k = r*2.5 + k*0.25 s)
  for (const id of ids) {
    const src = path.join(HERE, 'footage', `${id}.mp4`)
    const out = path.join(OUT, `${id}.raw.png`)
    ffmpeg(['-i', src, '-vf', 'fps=4,scale=180:-1,tile=10x6:padding=4:color=white', '-frames:v', '1', out])
    console.log(`raw sheet → ${out}`)
  }
  process.exit(0)
}

// Lay the clip's sound cues ({t, f, v, ss, dur}; files in tools/trailer/sfx,
// licences in sfx/LICENSES.md) under the silent mp4, in place.
function mixSfx(mp4, cues, duration) {
  const args = ['-i', mp4]
  const chains = []
  cues.forEach((c, i) => {
    if (c.ss != null) args.push('-ss', String(c.ss))
    if (c.dur != null) args.push('-t', String(c.dur))
    args.push('-i', path.join(HERE, 'sfx', c.f))
    const ms = Math.max(0, Math.round(c.t * 1000))
    chains.push(`[${i + 1}:a]aresample=48000,aformat=channel_layouts=stereo,volume=${c.v ?? 1},adelay=${ms}:all=1[a${i}]`)
  })
  const mix = `${cues.map((_, i) => `[a${i}]`).join('')}amix=inputs=${cues.length}:normalize=0:dropout_transition=0,loudnorm=I=-14:TP=-1.5:LRA=11,aresample=48000,apad,atrim=0:${duration.toFixed(3)}[aout]`
  const tmp = mp4.replace(/\.mp4$/, '.sfx.mp4')
  ffmpeg([...args, '-filter_complex', [...chains, mix].join(';'), '-map', '0:v', '-map', '[aout]',
    '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', tmp])
  fs.renameSync(tmp, mp4)
}

const { createServer } = await import(pathToFileURL(path.join(CLIENT, 'node_modules/vite/dist/node/index.js')).href)
const vite = await createServer({
  root: CLIENT, configFile: path.join(CLIENT, 'vite.config.js'), logLevel: 'error',
  server: { port: 0, fs: { allow: [ROOT] } },
})
await vite.listen()
const base = vite.resolvedUrls.local[0]
const footage = `/@fs/${path.join(HERE, 'footage').replace(/\\/g, '/')}/`
const { CLIPS } = await vite.ssrLoadModule('/src/trailer/Clips.jsx').catch(() => ({ CLIPS: null }))
const all = ids.length ? ids : Object.keys(CLIPS ?? {})
if (!all.length) throw new Error('no clips (pass ids explicitly)')

const browser = await chromium.launch({ channel: 'chrome', args: ['--autoplay-policy=no-user-gesture-required'] })
try {
  for (const id of all) {
    const H = CLIPS?.[id]?.h ?? H0 // 540 = 4:5 Reddit clips, 768 = 9:16 memes
    const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: SCALE })
    page.on('pageerror', e => console.error('page error:', e.message))
    await page.goto(`${base}trailer.html?clip=${id}&footage=${encodeURIComponent(footage)}`)
    await page.waitForFunction(() => window.__ready)
    await page.evaluate(() => window.__ready)
    const duration = await page.evaluate(() => window.__duration)
    const sfx = await page.evaluate(() => window.__sfx)
    const cdp = await page.context().newCDPSession(page)
    const clip = { x: 0, y: 0, width: W, height: H, scale: sheetOnly ? 1 : SCALE }
    const frames = path.join(HERE, '.frames', `clip-${id}`)
    fs.rmSync(frames, { recursive: true, force: true })
    fs.mkdirSync(frames, { recursive: true })
    const step = sheetOnly ? 1 / 4 : 1 / FPS
    const n = Math.floor(duration / step)
    for (let i = 0; i < n; i++) {
      await page.evaluate(t => window.__seek(t), i * step)
      const { data } = await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 95, clip })
      fs.writeFileSync(path.join(frames, `f${String(i).padStart(5, '0')}.jpg`), Buffer.from(data, 'base64'))
    }
    await page.close()
    const inp = ['-framerate', sheetOnly ? '4' : String(FPS), '-i', path.join(frames, 'f%05d.jpg')]
    if (sheetOnly) {
      ffmpeg([...inp, '-vf', `scale=144:-1,tile=10x${Math.ceil(n / 10)}`, '-frames:v', '1', path.join(OUT, `${id}.sheet.png`)])
      console.log(`${id}: sheet (${duration.toFixed(1)} s)`)
      continue
    }
    // 9:16 quizzes are for TikTok/Reels/Shorts → their own folder, no gif
    const quiz = H === QUIZ_H
    const dir = quiz ? OUT_SM : OUT
    const mp4 = path.join(dir, `${id}.mp4`), gif = path.join(dir, `${id}.gif`)
    ffmpeg([...inp, '-c:v', 'libx264', '-crf', '18', '-preset', 'slow', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', mp4])
    if (sfx?.length) mixSfx(mp4, sfx, duration)
    if (!quiz) ffmpeg(['-i', mp4, '-vf', 'fps=15,scale=540:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=160:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle', '-loop', '0', gif])
    const mb = f => (fs.statSync(f).size / 1e6).toFixed(1)
    console.log(`${id}: ${duration.toFixed(1)} s → ${mp4} (${mb(mp4)} MB)${quiz ? '' : `, gif ${mb(gif)} MB`}`)
  }
} finally {
  await browser.close()
  await vite.close()
}
