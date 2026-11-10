// Global interaction feedback (styles in interactions.css). Installed once.
//  • [data-tilt] elements lean towards the cursor (sets --tx/--ty ∈ [-1, 1]).
//  • Pressing a "main action" (.ui-btn.primary, .mm-tile, .pk-ok, .pk-opt,
//    .cd-tile, .po-row, .rs-next) leaves a short ring burst where it was hit.
// Mouse-only tilt (touch has no hover); everything off for reduced motion.
const BURST = '.ui-btn.primary, .ui-btn.danger, .mm-tile, .pk-ok, .po-row, .rs-next, .cd-buy'

export function installInteractions() {
  if (typeof window === 'undefined' || window.__chessplusFx) return
  window.__chessplusFx = true
  const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

  let tilted = null
  const reset = el => { el.style.removeProperty('--tx'); el.style.removeProperty('--ty') }
  document.addEventListener('pointermove', e => {
    if (e.pointerType !== 'mouse' || reduced()) return
    const el = e.target.closest?.('[data-tilt]')
    if (tilted && tilted !== el) { reset(tilted); tilted = null }
    if (!el) return
    const r = el.getBoundingClientRect()
    el.style.setProperty('--tx', (((e.clientX - r.left) / r.width) * 2 - 1).toFixed(3))
    el.style.setProperty('--ty', (((e.clientY - r.top) / r.height) * 2 - 1).toFixed(3))
    tilted = el
  }, { passive: true })
  document.addEventListener('pointerleave', () => { if (tilted) { reset(tilted); tilted = null } }, true)

  document.addEventListener('pointerdown', e => {
    if (reduced() || e.button > 0) return
    const el = e.target.closest?.(BURST)
    if (!el || el.disabled || el.getAttribute('aria-disabled') === 'true') return
    const ring = document.createElement('span')
    ring.className = 'fx-burst' + (el.classList.contains('danger') ? ' danger' : '')
    ring.style.left = `${e.clientX}px`
    ring.style.top = `${e.clientY}px`
    document.body.appendChild(ring)
    setTimeout(() => ring.remove(), 520)
  }, { passive: true })
}
