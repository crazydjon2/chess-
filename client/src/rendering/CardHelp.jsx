import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import './Card.css'

// A "?" button + hover tooltip for a card's full rules text — shared by
// the draft catalog and the battle hand (see Card.jsx), both of which
// live inside a scrolling container. The tooltip used to be plain
// `position:absolute` off the button, which meant it got silently clipped
// by that container's own overflow the moment it popped past the
// container's edge (any tile near the top of a scrolled catalog, any
// card near the top of the hand rail) — it wasn't missing, it was just
// invisible. `position:fixed`, positioned from the button's own measured
// on-screen rect on hover, escapes that clipping entirely and is clamped
// to the viewport so it can't run off the screen edge either.
//
// It also has to be a portal into document.body, not just fixed in place
// — the tile/card it lives inside lifts itself on hover via `transform`
// (.dr-piece-tile:hover, .card:hover, ...), and hovering the "?" button
// hovers its parent too. A `transform` on ANY ancestor makes that ancestor
// the containing block for `position:fixed` descendants (a real, if
// obscure, CSS rule) — so without the portal the tooltip was positioning
// itself relative to the lifted, translated tile instead of the viewport,
// landing hundreds of pixels off from the clamped coordinates it was
// actually given.
export default function CardHelp({ name, desc, className }) {
  const btnRef = useRef(null)
  const [pos, setPos] = useState(null)

  function show() {
    const rect = btnRef.current?.getBoundingClientRect()
    if (!rect) return
    const half = 95 // half of the tooltip's own 190px width
    const left = Math.min(Math.max(rect.left + rect.width / 2, half + 8), window.innerWidth - half - 8)
    setPos({ top: rect.top, left })
  }
  function hide() { setPos(null) }

  return (
    <>
      {/* A <span role="button">, not a real <button> — this renders inside
         DraftPhase.jsx's catalog tiles, which are themselves <button>s, and
         a <button> can't legally contain another <button> (invalid HTML;
         Chrome silently un-nests it at parse time and both React and real
         click/focus behavior get undefined from there). */}
      <span
        ref={btnRef}
        role="button"
        tabIndex={0}
        className={`card-help-btn${className ? ` ${className}` : ''}`}
        onClick={e => e.stopPropagation()}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        aria-label={`Описание карты: ${name}`}
      >
        ?
      </span>
      {pos && createPortal(
        <div className="card-tooltip-fixed" style={{ top: pos.top, left: pos.left }}>
          <span className="card-tooltip-name">{name}</span>
          {desc}
        </div>,
        document.body
      )}
    </>
  )
}
