import { PIECE_ICONS } from './pieceIcons'
import { PROMOTION_TYPES } from '../game/chess'
import './PromotionPicker.css'

const LABEL = { queen: 'Ферзь', rook: 'Ладья', bishop: 'Слон', knight: 'Конь' }

// Shown when your own pawn move reaches the far rank — the move itself
// isn't sent to the server until a promotion piece is chosen here.
export default function PromotionPicker({ color, onPick, onCancel }) {
  return (
    <div className="promo-overlay" onClick={onCancel}>
      <div className="promo-card" onClick={e => e.stopPropagation()}>
        <div className="promo-title">Превращение пешки</div>
        <div className="promo-options">
          {PROMOTION_TYPES.map(type => (
            <button key={type} className="promo-btn" onClick={() => onPick(type)}>
              <span className="promo-glyph">{PIECE_ICONS[color][type]}</span>
              <span className="promo-label">{LABEL[type]}</span>
            </button>
          ))}
        </div>
        <button className="promo-cancel" onClick={onCancel}>Отмена</button>
      </div>
    </div>
  )
}
