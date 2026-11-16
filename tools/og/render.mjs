// Renders the social preview card (client/og.html → client/src/og) to
// client/public/og.png at 1200×630. Usage: npm run og
import { chromium } from 'playwright-core'
import path from 'path'
import { fileURLToPath, pathToFileURL } from 'url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../client')
const OUT = path.join(ROOT, 'public/og.png')
// The CLIENT's own Vite (the repo root has another one, pulled in by vitest).
const { createServer } = await import(pathToFileURL(path.join(ROOT, 'node_modules/vite/dist/node/index.js')).href)

const server = await createServer({ root: ROOT, configFile: path.join(ROOT, 'vite.config.js'), server: { port: 0 }, logLevel: 'error' })
await server.listen()
const url = server.resolvedUrls.local[0]

let browser
for (const channel of ['chrome', 'msedge']) {
  try { browser = await chromium.launch({ channel }); break } catch { /* try next */ }
}
if (!browser) throw new Error('Need Chrome or Edge installed')
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 })
  await page.goto(`${url}og.html`)
  await page.waitForSelector('[data-og-ready]')
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(300)
  await page.locator('.og').screenshot({ path: OUT })
  console.log(`Wrote ${OUT}`)
} finally {
  await browser.close()
  await server.close()
}
