// Spreads jobs across worker threads (one per CPU core by default) and
// reports progress. Results come back in completion order with their job id.
import { Worker } from 'worker_threads'
import os from 'os'

export function runPool(jobs, { workers = Math.max(1, os.cpus().length - 1), batch = 4, onResult, onProgress } = {}) {
  return new Promise((resolve) => {
    const results = []
    let next = 0, done = 0, alive = 0
    const t0 = Date.now()
    const count = Math.min(workers, Math.max(1, Math.ceil(jobs.length / batch)))
    if (!jobs.length) { resolve(results); return }
    for (let w = 0; w < count; w++) {
      const worker = new Worker(new URL('./worker.js', import.meta.url))
      alive++
      const feed = () => {
        if (next >= jobs.length) { worker.terminate(); alive--; if (alive === 0) resolve(results); return }
        const slice = jobs.slice(next, next + batch)
        next += slice.length
        worker.postMessage({ jobs: slice })
      }
      worker.on('message', msg => {
        if (msg.done) { feed(); return }
        results.push(msg)
        done++
        onResult?.(msg)
        onProgress?.(done, jobs.length, Date.now() - t0)
      })
      worker.on('error', err => {
        console.error('worker error:', err)
        alive--
        if (alive === 0) resolve(results)
      })
      feed()
    }
  })
}
