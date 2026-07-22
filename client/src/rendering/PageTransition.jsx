import { useLayoutEffect, useEffect, useRef, useState } from 'react'
import './PageTransition.css'

// Safety net only, not a duration guess — see the getAnimations effect
// below. If a screen's CSS somehow never actually starts an animation on
// its exit ghost (a selector typo, an element with no matching rule),
// this guarantees the ghost still gets cleared instead of sitting inert
// forever.
const EXIT_FALLBACK_MS = 900

// Crossfades between screens on `pageKey` change instead of the instant
// unmount/mount swap React does by default — that hard jump-cut was the
// "дёрганые переходы" complaint. The outgoing and incoming screen briefly
// stack in the same CSS grid cell (see .pt-stack) so neither has to know
// about or resize for the other while they overlap.
//
// Mount this ONCE at a stable position in the tree (see App.jsx /
// OnlineApp.jsx) — every `return` branch that renders through it wraps its
// own JSX in `<PageTransition pageKey="...">`, and because they all sit at
// the exact same spot in the render tree, React treats them as the same
// component instance across branches, so its internal state (and the
// transition it drives) survives the swap.
//
// The "current" page is rendered straight from live props (not copied into
// state) so prop-only updates on the same page — a game-state tick, a
// nickname edit — never touch the leaving/entering machinery at all; only
// an actual pageKey change does. Only the OUTGOING page is ever snapshotted
// into state, as a frozen copy of its last render to fade out.
//
// `noExitSnapshotFor` — pageKeys that should NEVER get an exit ghost.
// Snapshotting works by rendering the outgoing `children` a second time at
// a new position in the tree (inside .pt-exit instead of .pt-enter) — for
// a plain presentational screen that's harmless, but for something with
// real side effects on mount (OnlineApp's socket connection, say) it means
// a whole SECOND live instance briefly exists, reconnecting a socket, etc.
// It also has its OWN nested PageTransition starting fresh, so its
// children get `.pt-enter` classes while the outer wrapper is animating
// them as `.pt-exit` — the two fight each other (visible as a flicker).
// Pages listed here just skip the ghost and vanish instantly; only the
// incoming page still animates in.
export default function PageTransition({ pageKey, children, noExitSnapshotFor = [] }) {
  const [leaving, setLeaving] = useState(null) // { key, node } | null
  const prevKeyRef      = useRef(pageKey)
  const prevChildrenRef = useRef(children)
  const exitRef         = useRef(null)

  // useLayoutEffect, not useEffect — this has to resolve BEFORE the
  // browser paints. A plain useEffect runs after the pageKey-change
  // render has already been painted (old "enter" div gone, `leaving`
  // still stale/null from before), so the outgoing page would flash to
  // nothing for a frame and only then pop back in as the exit ghost —
  // read as "no animation" at best and a visible blink at worst.
  // useLayoutEffect lets React fold the `leaving` update into the same
  // commit before anything reaches the screen.
  useLayoutEffect(() => {
    if (prevKeyRef.current !== pageKey) {
      if (noExitSnapshotFor.includes(prevKeyRef.current)) {
        setLeaving(null)
      } else {
        setLeaving({ key: prevKeyRef.current, node: prevChildrenRef.current })
      }
    }
    prevKeyRef.current = pageKey
    prevChildrenRef.current = children
  })

  // Clears the exit ghost exactly when its OWN CSS animation(s) actually
  // finish, instead of a fixed timeout guessing how long that'll take.
  // Different screens exit with very different total durations — a plain
  // whole-page slide, a per-section stagger, MainMenu's per-card random
  // scatter — and a single hardcoded number here was guaranteed to be
  // wrong for most of them: too short and the ghost gets yanked out from
  // under its own still-running animation (a visible snap mid-flight);
  // too long and it just sits there, already finished, doing nothing,
  // reading as "the old page won't go away". getAnimations({subtree:true})
  // asks the browser what's actually running on it right now and waits
  // for exactly that.
  //
  // Infinite ones are filtered out first — the frozen snapshot still
  // carries whatever decorative always-on animation the live page had
  // (a "your turn" glow pulse, say), and an infinite animation's
  // `.finished` promise never resolves at all, which silently hung this
  // on the fallback timeout every single time regardless of how fast the
  // real exit animation actually was.
  useEffect(() => {
    if (!leaving || !exitRef.current) return
    const anims = exitRef.current.getAnimations({ subtree: true }).filter(a => {
      const timing = a.effect?.getComputedTiming?.()
      return !timing || timing.iterations !== Infinity
    })
    if (anims.length === 0) {
      setLeaving(null)
      return
    }
    let done = false
    const finish = () => { if (!done) { done = true; setLeaving(null) } }
    Promise.all(anims.map(a => a.finished.catch(() => {}))).then(finish)
    const fallback = setTimeout(finish, EXIT_FALLBACK_MS)
    return () => { done = true; clearTimeout(fallback) }
  }, [leaving])

  return (
    <div className="pt-stack">
      {leaving && (
        <div key={`exit-${leaving.key}`} className="pt-exit" ref={exitRef}>
          {leaving.node}
        </div>
      )}
      <div key={`enter-${pageKey}`} className="pt-enter">
        {children}
      </div>
    </div>
  )
}
