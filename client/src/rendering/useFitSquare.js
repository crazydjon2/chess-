import { useLayoutEffect, useRef, useState } from 'react'

// Measures the element the returned ref is attached to and returns the
// largest { w, h } rectangle of aspect cols:rows that fits inside it. Used
// to size the board to an EXACT rectangle instead of leaning on CSS
// aspect-ratio + max-width/max-height, which can't hold the shape inside a
// box constrained on both axes without a clamp that squishes it — a square
// grid in a squished box shows cream letterbox bands ("white stripes"), and
// a CSS-grid board's own cells stop being square. The measured element must
// be sized by its own container (flex/grid), never by this child, so
// writing the child's size back can't feed into the next measurement.
export default function useFitSquare(cols, rows, enabled = true) {
  const ref = useRef(null)
  const [fit, setFit] = useState(null)

  useLayoutEffect(() => {
    if (!enabled) { setFit(null); return }
    const el = ref.current
    if (!el) return
    const update = () => {
      const w = el.clientWidth
      const h = el.clientHeight
      if (!w || !h) return
      const bw = Math.min(w, (h * cols) / rows)
      setFit({ w: Math.floor(bw), h: Math.floor((bw * rows) / cols) })
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [cols, rows, enabled])

  return [ref, fit]
}
