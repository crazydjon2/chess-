// Renders social-profile art in tools/trailer/out/social (YouTube banner).
import { chromium } from 'playwright-core'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'out', 'social')
const browser = await chromium.launch({ channel: 'chrome' })
const page = await browser.newPage({ viewport: { width: 2560, height: 1440 } })
await page.goto(pathToFileURL(path.join(dir, 'yt-banner.html')).href)
await page.waitForLoadState('networkidle'); await page.evaluate(() => document.fonts.ready)
await page.screenshot({ path: path.join(dir, 'yt-banner.png') })
await browser.close()
console.log('yt-banner.png')
