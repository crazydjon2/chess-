import { useEffect, useState } from 'react'
import './Clock.css'

function formatClock(seconds) {
  const s = Math.max(0, Math.ceil(seconds))
  const m = Math.floor(s / 60)
  return `${m}:${String(s % 60).padStart(2, '0')}`
}

// A player's clock. `baseSeconds` is what was left at `turnStartedAt`;
// while `ticking` it counts down live. `active` = their turn (gold face).
export default function Clock({ baseSeconds, turnStartedAt, ticking, active = ticking, lowSeconds = 10 }) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!ticking) return
    const id = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(id)
  }, [ticking])

  if (baseSeconds == null || !Number.isFinite(baseSeconds)) return null

  const remaining = ticking && turnStartedAt != null
    ? Math.max(0, baseSeconds - Math.max(0, (now - turnStartedAt) / 1000))
    : baseSeconds
  const low = ticking && remaining <= lowSeconds

  return (
    <span className={`clock${active ? ' active' : ''}${low ? ' low' : ''}`} role="timer">
      {formatClock(remaining)}
    </span>
  )
}
