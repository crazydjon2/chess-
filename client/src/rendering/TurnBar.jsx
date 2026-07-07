// Persistent, always-visible turn indicator — replaces relying on the
// subtle panel-glow alone. `sub` (online mode only) makes it unmistakable
// whether it's you or the opponent who needs to act.
export default function TurnBar({ color, text, sub, urgent }) {
  return (
    <div className={`turn-bar${urgent ? ' urgent' : ''}`}>
      <span className={`turn-bar-dot p-${color}`} />
      <span className="turn-bar-text">{text}</span>
      {sub && <span className={`turn-bar-sub${urgent ? ' mine' : ''}`}>{sub}</span>}
    </div>
  )
}
