import { useEffect, useState } from 'react'

// Each color gets its OWN free-look window on its own first move of the
// round (see chess.js's applyMove / analysisUsed) — not just whoever moves
// first chronologically, so it's never a one-sided edge for white. This
// banner tracks whichever color currently has the turn: shows while
// `hasAnalysisLeft` (that color hasn't spent its window yet) and the
// deadline hasn't passed, then disappears once they move or the window runs out.
export default function AnalysisBanner({ turnStartedAt, analysisSeconds, hasAnalysisLeft }) {
  const [now, setNow] = useState(() => Date.now())
  const deadline = hasAnalysisLeft && turnStartedAt != null && analysisSeconds
    ? turnStartedAt + analysisSeconds * 1000
    : null
  const active = deadline != null && deadline > now

  useEffect(() => {
    if (!active) return
    const id = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(id)
  }, [active])

  if (!active) return null
  const secondsLeft = Math.max(1, Math.ceil((deadline - now) / 1000))

  // A compact header badge, not a full-width banner — see GameView.jsx's
  // comment on why: a banner needed its own reserved slot to avoid
  // shifting the board every time it mounted/unmounted, and that slot ate
  // real board height even on the (vast majority of) turns it sat empty.
  // A badge's own presence never changes the header's height either way.
  return (
    <span className="threat-badge analysis" title="Часы ещё не идут — время спокойно посмотреть на позицию">
      🔍 {secondsLeft}с
    </span>
  )
}
