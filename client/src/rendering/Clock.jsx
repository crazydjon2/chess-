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
export default function Clock({ baseSeconds, turnStartedAt, ticking }) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!ticking) return
    const id = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(id)
  }, [ticking])

  if (baseSeconds == null) return null

  const remaining = ticking && turnStartedAt != null
    ? Math.max(0, baseSeconds - (now - turnStartedAt) / 1000)
    : baseSeconds
  const low = remaining <= 20

  return (
    <span className={`clock${ticking ? ' ticking' : ''}${low ? ' low' : ''}`}>
      ⏱ {formatClock(remaining)}
    </span>
  )
}
