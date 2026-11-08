import { useLayoutEffect, useState } from 'react'
import { t } from '../i18n'
import { Piece } from '../skins/Piece'
import { PROMOTION_TYPES } from '../game/chess'
import Overlay from './ui/Overlay'
import { PIECE_LABEL } from '../game/economy'

// Promotion: a strip of the four pieces right under the promotion square,
// over a dimmed screen. Click outside / Esc cancels the move.
export default function PromotionPicker({ color, square, onPick, onCancel }) {
  const [pos, setPos] = useState(null)
  useLayoutEffect(() => {
    const measure = () => {
      const el = square && document.querySelector(`.mx-board .bd-cell[data-square="${square}"]`)
      if (!el) { setPos({ left: window.innerWidth / 2, top: window.innerHeight / 2 - 50 }); return }
      const r = el.getBoundingClientRect()
      const w = Math.min(window.innerWidth - 16, 380)
      const left = Math.min(window.innerWidth - w / 2 - 8, Math.max(w / 2 + 8, r.left + r.width / 2))
      setPos({ left, top: r.bottom + 12, arrow: r.left + r.width / 2 - left, hole: r })
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [square])
  useLayoutEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onCancel?.() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])
  return (
    <Overlay sheet={false} style={{ alignItems: 'flex-start' }} onClose={onCancel}>
      {pos?.hole && (
        <span className="pr-hole" style={{ left: pos.hole.left, top: pos.hole.top, width: pos.hole.width, height: pos.hole.height }} />
      )}
      {pos && (
        <div className="pr-pop" style={{ left: pos.left, top: pos.top }} role="dialog" aria-label={t('promo.title')} onClick={e => e.stopPropagation()}>
          {PROMOTION_TYPES.map(type => (
            <button key={type} className="pr-opt" onClick={() => onPick(type)} aria-label={PIECE_LABEL[type]} title={PIECE_LABEL[type]} data-promo={type}>
              <Piece type={type} color={color} size={58} center />
            </button>
          ))}
          <span className="pr-arrow" style={{ left: `calc(50% + ${pos.arrow ?? 0}px)` }} />
        </div>
      )}
    </Overlay>
  )
}
