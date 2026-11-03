// Worker thread: plays the jobs it's handed and posts each record back.
// Math.random is swapped for the job's seeded RNG, so the engine's own
// randomness (unstable shifts, auto-placement) is reproducible too.
import { parentPort } from 'worker_threads'
import { playRound } from './game.js'
import { mulberry32 } from './rng.js'

parentPort.on('message', ({ jobs }) => {
  for (const job of jobs) {
    const rng = mulberry32(job.seed)
    Math.random = rng
    let rec
    try {
      rec = playRound(job.cfg, rng)
    } catch (e) {
      rec = { crash: true, error: String(e?.message ?? e), stack: String(e?.stack ?? '').split('\n').slice(0, 6).join('\n') }
    }
    parentPort.postMessage({ id: job.id, exp: job.exp, seed: job.seed, cfg: stripCfg(job.cfg), rec })
  }
  parentPort.postMessage({ done: true })
})

function stripCfg(cfg) {
  const { pattern, ...rest } = cfg
  return { ...rest, board: pattern?.name ?? null }
}
