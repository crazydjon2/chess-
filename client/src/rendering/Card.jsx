import './Card.css'

// The card face itself only shows glyph/name/cost — the full rules text
// lives behind the "?" button's tooltip instead of being crammed onto the
// card at ~7px font. Clicking "?" is stopped from bubbling up so it never
// also counts as selecting/playing the card.
export default function Card({ card, selected, disabled, onClick }) {
  return (
    <div
      className={`card${selected ? ' selected' : ''}${disabled ? ' disabled' : ''}`}
      style={{ '--accent': card.accent }}
      onClick={disabled ? undefined : onClick}
    >
      <button
        type="button"
        className="card-help-btn"
        onClick={e => e.stopPropagation()}
        aria-label={`Описание карты: ${card.name}`}
      >
        ?
        <span className="card-tooltip">
          <span className="card-tooltip-name">{card.name}</span>
          {card.desc}
        </span>
      </button>
      <div className="card-glyph">{card.glyph}</div>
      <div className="card-divider" />
      <div className="card-name">{card.name}</div>
    </div>
  )
}
