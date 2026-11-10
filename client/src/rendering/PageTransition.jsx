import { Component, createRef } from 'react'
import './PageTransition.css'

// Safety net only: the exit normally ends when its own pt-* animations do.
const EXIT_FALLBACK_MS = 450
const FRESH_MS = 700

// Crossfades between screens on `pageKey` change. The outgoing and incoming
// screen briefly stack in the same CSS grid cell (see .pt-stack).
//
// The outgoing page is a FROZEN DOM SNAPSHOT (cloneNode of the last
// rendered page, taken just before React swaps it), not a second React
// render of it. A re-render remounted the old page: its mount animations
// (menu card deal, code tiles…), mount sounds (round result) and portaled
// modals (round result, settings) all ran again over the next page — the
// "elements from the previous page stay / something hangs" report. A
// static clone has no effects, no portals and no state; CSS in
// PageTransition.css switches off every animation inside it except the
// exit choreography, and it's removed as soon as that finishes.
//
// Mount this ONCE at a stable position (App.jsx / OnlineApp.jsx): every
// branch wraps its JSX in <PageTransition pageKey="…"> at the same spot so
// React keeps this one instance across branches.
//
// `noExitSnapshotFor` — pageKeys that run their own exit (sandbox) and must
// not get a ghost.
export default class PageTransition extends Component {
  state = { staleKey: null }
  enterRef = createRef()
  exitHostRef = createRef()
  freshTimer = null
  exitTimer = null

  componentDidMount() { this.scheduleStale() }

  componentWillUnmount() {
    clearTimeout(this.freshTimer)
    clearTimeout(this.exitTimer)
  }

  scheduleStale() {
    clearTimeout(this.freshTimer)
    const key = this.props.pageKey
    this.freshTimer = setTimeout(() => this.setState({ staleKey: key }), FRESH_MS)
  }

  // Runs before React touches the DOM — the old page is still there to copy.
  getSnapshotBeforeUpdate(prev) {
    if (prev.pageKey === this.props.pageKey) return null
    if ((prev.noExitSnapshotFor ?? []).includes(prev.pageKey)) return null
    const el = this.enterRef.current
    if (!el) return null
    // the snapshot is decoration only: drop ids / test ids so it never
    // duplicates the live page's (shared chrome like the name plate)
    const clone = el.cloneNode(true)
    for (const e of [clone, ...clone.querySelectorAll('[id], [data-testid]')]) {
      e.removeAttribute('id'); e.removeAttribute('data-testid')
    }
    return clone
  }

  componentDidUpdate(prev, _state, clone) {
    if (prev.pageKey === this.props.pageKey) return
    this.scheduleStale()
    const host = this.exitHostRef.current
    if (!host) return
    clearTimeout(this.exitTimer)
    host.replaceChildren()
    if (!clone) return
    clone.className = 'pt-exit'
    clone.setAttribute('aria-hidden', 'true')
    clone.inert = true
    host.appendChild(clone)
    const done = () => { clearTimeout(this.exitTimer); if (clone.parentNode === host) host.removeChild(clone) }
    const anims = clone.getAnimations({ subtree: true }).filter(a => {
      if (a.animationName && !a.animationName.startsWith('pt-')) return false
      return a.effect?.getComputedTiming?.().iterations !== Infinity
    })
    this.exitTimer = setTimeout(done, EXIT_FALLBACK_MS)
    if (anims.length === 0) { done(); return }
    Promise.all(anims.map(a => a.finished.catch(() => {}))).then(done)
  }

  render() {
    const { pageKey, children } = this.props
    const fresh = this.state.staleKey !== pageKey
    return (
      <div className="pt-stack">
        <div className="pt-exit-host" ref={this.exitHostRef} />
        <div key={`enter-${pageKey}`} ref={this.enterRef} className={`pt-enter${fresh ? ' fresh' : ''}`}>
          {children}
        </div>
      </div>
    )
  }
}
