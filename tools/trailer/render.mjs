// Renders the trailer composition (client/trailer.html → src/trailer) frame
// by frame into tools/trailer/out/trailer.mp4 (1080×1920, 30 fps).
//   node tools/trailer/render.mjs                 # full quality
//   node tools/trailer/render.mjs --sheet         # quick contact sheet only
// Footage must exist first: node tools/trailer/capture.mjs
import { chromium } from 'playwright-core'
import path from 'path'
import fs from 'fs'
import { fileURLToPath, pathToFileURL } from 'url'
import { ffmpeg } from './lib/recorder.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '../..')
const CLIENT = path.join(ROOT, 'client')
const OUT = path.join(HERE, 'out')
const FRAMES = path.join(HERE, '.frames', 'trailer')
const FPS = 30, SCALE = 2.5
const sheetOnly = process.argv.includes('--sheet')

const { createServer } = await import(pathToFileURL(path.join(CLIENT, 'node_modules/vite/dist/node/index.js')).href)
const vite = await createServer({
  root: CLIENT, configFile: path.join(CLIENT, 'vite.config.js'), logLevel: 'error',
  server: { port: 0, fs: { allow: [ROOT] } }, // footage lives outside client/
})
await vite.listen()
const base = vite.resolvedUrls.local[0]
const footage = `/@fs/${path.join(HERE, 'footage').replace(/\\/g, '/')}/`

const browser = await chromium.launch({ channel: 'chrome', args: ['--autoplay-policy=no-user-gesture-required'] })
try {
  const page = await browser.newPage({ viewport: { width: 432, height: 768 }, deviceScaleFactor: SCALE })
  page.on('pageerror', e => console.error('page error:', e.message))
  await page.goto(`${base}trailer.html?footage=${encodeURIComponent(footage)}`)
  await page.waitForFunction(() => window.__ready)
  await page.evaluate(() => window.__ready)
  const duration = await page.evaluate(() => window.__duration)
  const cdp = await page.context().newCDPSession(page)
  const clip = { x: 0, y: 0, width: 432, height: 768, scale: sheetOnly ? 1 : SCALE }
  fs.rmSync(FRAMES, { recursive: true, force: true })
  fs.mkdirSync(FRAMES, { recursive: true })
  fs.mkdirSync(OUT, { recursive: true })

  const step = sheetOnly ? 1 / 4 : 1 / FPS
  const n = Math.floor(duration / step)
  const t0 = Date.now()
  for (let i = 0; i < n; i++) {
    await page.evaluate(t => window.__seek(t), i * step)
    const { data } = await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 95, clip })
    fs.writeFileSync(path.join(FRAMES, `f${String(i).padStart(5, '0')}.jpg`), Buffer.from(data, 'base64'))
    if (i % 60 === 0) process.stdout.write(`\r${i}/${n} frames`)
  }
  console.log(`\r${n} frames in ${((Date.now() - t0) / 1000).toFixed(0)} s`)

  if (sheetOnly) {
    const out = path.join(OUT, 'trailer.sheet.png')
    ffmpeg(['-framerate', '4', '-i', path.join(FRAMES, 'f%05d.jpg'), '-vf', 'scale=144:-1,tile=12x7', '-frames:v', '1', out])
    console.log(`sheet → ${out}`)
  } else {
    const out = path.join(OUT, 'trailer.mp4')
    ffmpeg(['-framerate', String(FPS), '-i', path.join(FRAMES, 'f%05d.jpg'),
      '-c:v', 'libx264', '-crf', '17', '-preset', 'slow', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out])
    console.log(`video → ${out}`)
  }
} finally {
  await browser.close()
  await vite.close()
}
