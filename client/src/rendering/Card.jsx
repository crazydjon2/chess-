import './Card.css'

export default function Card({ card, selected, disabled, onClick }) {
  return (
    <div
      className={`card${selected ? ' selected' : ''}${disabled ? ' disabled' : ''}`}
      style={{ '--accent': card.accent }}
      onClick={disabled ? undefined : onClick}
    >
      <div className="card-glyph">{card.glyph}</div>
      <div className="card-divider" />
      <div className="card-name">{card.name}</div>
      <div className="card-desc">{card.desc}</div>
    </div>
  )
}
