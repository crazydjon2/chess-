import { PIECE_GLYPHS, PIECE_LABEL } from '../game/economy'
import './PromotionPicker.css'

// Shown when the necromancy card is selected — unlike every other card,
// its real choice is WHICH captured piece to bring back, not a board
// square (where it reappears is random — see cardEffects.js), so it can't
// reuse the normal click-a-highlighted-square flow at all. Reuses
// PromotionPicker's exact modal styling (same "small choice popup" shape),
// just with a different option set.
export default function NecromancyPicker({ color, options, onPick, onCancel }) {
  return (
    <div className="promo-overlay" onClick={onCancel}>
      <div className="promo-card" onClick={e => e.stopPropagation()}>
        <div className="promo-title">Кого возродить?</div>
        {options.length === 0
          ? <div className="promo-label">Некого возрождать — нет срубленных фигур или нет места</div>
          : (
            <div className="promo-options">
              {options.map(type => (
                <button key={type} className="promo-btn" onClick={() => onPick(type)}>
                  <span className="promo-glyph">{PIECE_GLYPHS[color][type]}</span>
                  <span className="promo-label">{PIECE_LABEL[type]}</span>
                </button>
              ))}
            </div>
          )}
        <button className="promo-cancel" onClick={onCancel}>Отмена</button>
      </div>
    </div>
  )
}
