import { useLayoutEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

const LEAVE_MS = 180

// Full-screen scrim + centered modal (bottom sheet on phones with
// `sheet`). Portaled to <body> so no screen's stacking context (z-indexed
// headers, the tilted board) can ever draw on top of it.
//
// Exit animation: callers just stop rendering the modal ({open && …}), so
// on unmount the overlay leaves a frozen copy of itself behind that plays
// the close animation (.ui-overlay.leaving in base.css) and removes itself.
export default function Overlay({ children, onClose, sheet = true, className = '', style }) {
  const ref = useRef(null)
  useLayoutEffect(() => {
    const node = ref.current
    return () => {
      if (!node || typeof document === 'undefined') return
      if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
      const ghost = node.cloneNode(true)
      ghost.classList.add('leaving')
      ghost.setAttribute('aria-hidden', 'true')
      ghost.inert = true
      // a dead copy: no ids / data hooks that scripts or tests could grab
      for (const e of [ghost, ...ghost.querySelectorAll('*')]) {
        for (const a of [...e.attributes]) if (a.name === 'id' || a.name.startsWith('data-')) e.removeAttribute(a.name)
      }
      document.body.appendChild(ghost)
      setTimeout(() => ghost.remove(), LEAVE_MS + 40)
    }
  }, [])
  return createPortal(
    <div ref={ref} className={`ui-overlay${sheet ? ' sheet-on-phone' : ''} ${className}`} style={style} onClick={onClose}>
      {children}
    </div>,
    document.body,
  )
}
