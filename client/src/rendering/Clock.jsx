import { useEffect, useState } from 'react'
import './Clock.css'

function formatClock(seconds) {
  const s = Math.max(0, Math.ceil(seconds))
  const m = Math.floor(s / 60)
  return `${m}:${String(s % 60).padStart(2, '0')}`
}

// A real per-player chess clock (see draftPools.js's TIME_LIMIT_BY_ROUND).
// `baseSeconds`/`turnStartedAt` are the authoritative values from the last
// server sync; while it's this side's turn, the displayed value ticks down
// locally between syncs (via its own interval) instead of visibly freezing
// for the whole turn and then jumping on the next broadcast. `baseSeconds`
// of null/undefined means untimed (sandbox mode) — renders nothing.
//
// `hasAnalysisLeft`/`analysisSeconds`: while this color still has its own
// unused analysis window (see chess.js's applyMove), the clock must not
// visibly tick at all during it — showing it count down would contradict
// AnalysisBanner's "часы ещё не идут" and misrepresent what actually gets
// charged. So the effective start of ticking is pushed to
// turnStartedAt + analysisSeconds, exactly matching the discount applyMove
// will apply once a move actually lands — the display and the real charge
// can never disagree.
export default function Clock({ baseSeconds, turnStartedAt, ticking, analysisSeconds = 0, hasAnalysisLeft = false }) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!ticking) return
    const id = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(id)
  }, [ticking])

  if (baseSeconds == null) return null

  const chargeStart = turnStartedAt != null && hasAnalysisLeft
    ? turnStartedAt + analysisSeconds * 1000
    : turnStartedAt
  const remaining = ticking && chargeStart != null
    ? Math.max(0, baseSeconds - Math.max(0, (now - chargeStart) / 1000))
    : baseSeconds
  const low = remaining <= 20

  return (
    <span className={`clock${ticking ? ' ticking' : ''}${low ? ' low' : ''}`}>
      ⏱ {formatClock(remaining)}
    </span>
  )
}
