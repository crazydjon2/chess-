import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import './SideDrawer.css'

// Mobile card/piece "deck" as a slide-out side panel instead of a permanent
// strip under the board — that strip ate board height on every screen. Here
// a thin trigger bar (in normal flow, so its height is deterministic and the
// board never jumps) opens a panel that slides in from the RIGHT over the
// board (portaled to <body> to escape the board's stacking context, same as
// BattleLog). Picking an item closes the panel; while an item is "armed"
// (selected and waiting for a board target) the trigger turns into a Cancel
// control so the choice can always be backed out of.
//
// Desktop keeps its own always-visible rail (CardHand / .pl-piece-rail) — the
// trigger bar and panel are display:none there (see SideDrawer.css).
export default function SideDrawer({
  icon, label, count, title,
  armed, armedLabel = 'Отмена', onCancel,
  open, onOpenChange,
  disabled,
  accent = '#f0b429',
  emptyText,
  barExtra,
  children,
}) {
  // Kept mounted through the slide-out so the exit animation can play; the
  // panel unmounts itself on the closing animation's end (see onAnimationEnd).
  const [visible, setVisible] = useState(open)
  useEffect(() => { if (open) setVisible(true) }, [open])

  const hasItems = Array.isArray(children) ? children.length > 0 : !!children

  return (
    <>
      <div className="sd-bar">
        {armed ? (
          <button className="sd-trigger sd-trigger-cancel" onClick={onCancel}>
            <span className="sd-trigger-x">✕</span>
            <span className="sd-trigger-text">{armedLabel}</span>
          </button>
        ) : (
          <button
            className="sd-trigger"
            style={{ '--sd-accent': accent }}
            disabled={disabled}
            onClick={() => onOpenChange(!open)}
          >
            <span className="sd-trigger-icon">{icon}</span>
            <span className="sd-trigger-text">{label}</span>
            <span className="sd-trigger-count">{count}</span>
          </button>
        )}
        {barExtra}
      </div>

      {visible && createPortal(
        <>
          <div
            className={`sd-backdrop${open ? '' : ' closing'}`}
            onClick={() => onOpenChange(false)}
          />
          <div
            className={`sd-panel${open ? '' : ' closing'}`}
            onAnimationEnd={() => { if (!open) setVisible(false) }}
          >
            <div className="sd-panel-head">
              <span className="sd-panel-title">{title}</span>
              <button className="sd-panel-close" onClick={() => onOpenChange(false)} title="Закрыть">✕</button>
            </div>
            <div className="sd-panel-list">
              {hasItems ? children : <div className="sd-panel-empty">{emptyText}</div>}
            </div>
          </div>
        </>,
        document.body
      )}
    </>
  )
}
