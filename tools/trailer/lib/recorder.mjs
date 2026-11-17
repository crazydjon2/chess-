// Page-only footage recorder: grabs screenshots of ONE page through CDP
// (never the screen/window), stamps each with the time it was taken, and
// turns them into a constant-30fps H.264 clip with ffmpeg.
import fs from 'fs'
import path from 'path'
import { execFileSync } from 'child_process'

export const FFMPEG = process.env.FFMPEG
  || path.join(process.env.LOCALAPPDATA ?? '', 'Microsoft/WinGet/Links/ffmpeg.exe')

export function ffmpeg(args) {
  execFileSync(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: 'inherit' })
}

export async function startRecording(page, dir, { scale = 1 } = {}) {
  const vp = page.viewportSize()
  // clip.scale makes Chrome render at full device resolution (plain
  // captureScreenshot ignores deviceScaleFactor)
  const clip = { x: 0, y: 0, width: vp.width, height: vp.height, scale }
  fs.rmSync(dir, { recursive: true, force: true })
  fs.mkdirSync(dir, { recursive: true })
  const cdp = await page.context().newCDPSession(page)
  const state = { stop: false, frames: [], dir }
  state.loop = (async () => {
    while (!state.stop) {
      const t = Date.now()
      try {
        const { data } = await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 92, optimizeForSpeed: true, clip })
        const name = `f${String(state.frames.length).padStart(5, '0')}.jpg`
        fs.writeFileSync(path.join(dir, name), Buffer.from(data, 'base64'))
        state.frames.push({ name, t })
      } catch (e) {
        if (!state.stop) throw e
      }
    }
    await cdp.detach().catch(() => {})
  })()
  return state
}

// Stops and encodes to `out` (mp4). Each frame is held until the next one
// was taken, so real timing is kept even though capture fps varies.
// speed: the page ran slowed down by this factor (slow-mo capture) — the
// clip is sped back up so it plays at real pace with more frames.
export async function stopRecording(state, out, { speed = 1 } = {}) {
  state.stop = true
  await state.loop
  const { frames, dir } = state
  if (frames.length < 2) throw new Error('too few frames')
  const end = Date.now()
  const lines = []
  frames.forEach((f, i) => {
    const next = frames[i + 1]?.t ?? end
    lines.push(`file '${f.name}'`, `duration ${((next - f.t) / 1000 / speed).toFixed(4)}`)
  })
  lines.push(`file '${frames.at(-1).name}'`) // concat demuxer quirk: last file listed twice
  fs.writeFileSync(path.join(dir, 'list.txt'), lines.join('\n'))
  ffmpeg(['-f', 'concat', '-safe', '0', '-i', path.join(dir, 'list.txt'),
    '-vf', 'setpts=PTS-STARTPTS,fps=30,format=yuv420p', '-c:v', 'libx264', '-crf', '15', '-g', '6', '-preset', 'medium', '-movflags', '+faststart', out])
  const secs = (end - frames[0].t) / 1000 / speed
  return { frames: frames.length, secs, fps: frames.length / secs }
}
