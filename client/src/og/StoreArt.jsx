// Store-page section art (itch.io description images), drawn with the game's
// own card icons and real screenshots. og.html?store=how|cards, rendered by
// tools/trailer/itch.mjs. `shots` = URL prefix of tools/trailer/out/itch/.
import { CardIcon } from '../skins/Piece'
import './og.css'

export const STORE_W = 900

const CARDS = [
  { id: 'meteor', name: 'Meteor', text: 'Lands on a square two turns later. Whatever is there gets hit.' },
  { id: 'freeze', name: 'Freeze Mine', text: 'Invisible trap. Step on it and skip a turn.' },
  { id: 'shield', name: 'Shield', text: 'Your piece survives one hit. The attacker bounces off.' },
  { id: 'unstable', name: 'Unstable Piece', text: 'A piece keeps shifting into other types.' },
  { id: 'barricade', name: 'Stone', text: 'A wall on any empty square.' },
  { id: 'smoke_screen', name: 'Smoke Screen', text: 'Hide your pieces from the opponent.' },
  { id: 'add_cell', name: 'Add Square', text: 'Grow the board past its edge.' },
]

function Head({ n, title }) {
  return (
    <div className="st-head">
      {n && <span className="st-num">{n}</span>}
      <span>{title}</span>
    </div>
  )
}

export default function StoreArt({ kind, shots }) {
  if (kind === 'how') {
    return (
      <div className="st" data-og-ready="1">
        <div className="st-title">HOW A ROUND GOES</div>
        <div className="st-steps">
          <div className="st-step">
            <Head n="1" title="Recruit" />
            <div className="st-shot"><img src={`${shots}2-recruit.png`} alt="" /></div>
            <p>Take turns spending coins: buy pieces, place them on your half, buy cards. Both builds are open.</p>
          </div>
          <div className="st-arrow">›</div>
          <div className="st-step">
            <Head n="2" title="Battle" />
            <div className="st-shot"><img src={`${shots}3-battle.png`} alt="" /></div>
            <p>Normal chess moves plus your cards. Capture the enemy king to win the round.</p>
          </div>
        </div>
      </div>
    )
  }
  return (
    <div className="st" data-og-ready="1">
      <div className="st-title">7 CARDS THAT BREAK THE RULES</div>
      <div className="st-cards">
        {CARDS.map(c => (
          <div key={c.id} className="st-card">
            <CardIcon id={c.id} size={64} radius={14} iconScale={0.6} />
            <div>
              <b>{c.name}</b>
              <span>{c.text}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
