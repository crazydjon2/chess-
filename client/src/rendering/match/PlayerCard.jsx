import { t } from '../../i18n'
import Clock from '../Clock'
import { Piece, CardIcon } from '../../skins/Piece'
import { CARD_DEFS } from '../../game/cards'
import { CAPTURE_ORDER } from '../../game/economy'

// One player's panel — recruit (coins / army size / bought cards) or battle
// (captures / cards in hand). Desktop: a stacked card in the left column;
// portrait: one compact row above/below the board (see match.css).
export default function PlayerCard({
  side,               // 'opp' | 'me'
  color, name,
  active = false,     // their turn
  inCheck = false,
  clock,              // { seconds, startedAt, ticking, low }
  score = 0, roundsToWin = 2,
  recruit,            // { coins, pieces, maxPieces } — recruit phase only
  cards,              // [{ id, used }] — shown as chips
  cardsOnDesktop = true, // false: chips hidden on desktop (shown in the right column instead)
  captured,           // [type] — pieces of the OTHER color this player took
  emptyCardsLabel,
  hideEmptyCards = false, // portrait battle: no "no cards" chip row
}) {
  const otherColor = color === 'white' ? 'black' : 'white'
  const sortedCaps = captured ? [...captured].sort((a, b) => CAPTURE_ORDER.indexOf(a) - CAPTURE_ORDER.indexOf(b)) : null
  return (
    <section className={`pc-card ui-panel ${side}${active ? ' active' : ''}${inCheck ? ' check' : ''}`} aria-label={name}>
      <div className="pc-head">
        <span className={`ui-avatar ${color}`}><Piece type="king" color={color === 'white' ? 'white' : 'black'} size={30} center thin /></span>
        <div className="pc-name-wrap">
          <span className={`pc-name${(name?.length ?? 0) > 9 ? ' long' : ''}`} title={name}>{name}</span>
          <span className="pc-dots" aria-label={t('common.score', { n: score })}>
            {Array.from({ length: roundsToWin }, (_, i) => <i key={i} className={i < score ? 'on' : ''} />)}
          </span>
        </div>
        {inCheck && <span className="pc-check">{t('player.check')}</span>}
        {recruit && (
          <span className="pc-recruit-inline">
            <span className="pc-coins"><span className="ui-coin" /><span className="ui-num">{recruit.coins}</span></span>
            <span className="ui-sub"><span className="pc-word">{t('recruit.pieces')} </span><b>{recruit.pieces}</b> / {recruit.maxPieces}</span>
          </span>
        )}
        {cards && !(hideEmptyCards && cards.length === 0) && (
          <span className={`pc-chips inline${cardsOnDesktop ? '' : ' portrait-only'}${cards.length > 2 ? ' many' : ''}`}>
            <CardChips cards={cards} emptyLabel={emptyCardsLabel} />
          </span>
        )}
        {sortedCaps && (
          <span className="pc-caps inline">
            <span className="pc-caps-label">{t('battle.captured')}</span>
            {sortedCaps.map((type, i) => <Piece key={i} type={type} color={otherColor} size={18} thin />)}
            {sortedCaps.length > 0 && <b>{sortedCaps.length}</b>}
          </span>
        )}
        {clock && <Clock baseSeconds={clock.seconds} turnStartedAt={clock.startedAt} ticking={clock.ticking} active={active} />}
      </div>

      {recruit && (
        <div className="pc-recruit">
          <span className="pc-coins big"><span className={`ui-coin${side === 'me' ? ' lg' : ''}`} /><span className="ui-num">{recruit.coins}</span></span>
          <span className="ui-sub">{t('recruit.pieces')} <b>{recruit.pieces}</b> / {recruit.maxPieces}</span>
        </div>
      )}
      {cards && cardsOnDesktop && (
        <div className="pc-chips block">
          <CardChips cards={cards} emptyLabel={emptyCardsLabel} />
        </div>
      )}
      {sortedCaps && (
        <div className="pc-caps block ui-well">
          <div className="pc-caps-top"><span>{t('battle.captured')}</span><b>{sortedCaps.length}</b></div>
          <div className="pc-caps-row">
            {sortedCaps.map((type, i) => <Piece key={i} type={type} color={otherColor} size={22} thin />)}
          </div>
        </div>
      )}
    </section>
  )
}

function CardChips({ cards, emptyLabel }) {
  if (!cards.length) return <span className="ui-chip empty">{emptyLabel ?? t('recruit.noCards')}</span>
  return cards.map((c, i) => (
    <span key={`${c.id}-${i}`} className={`ui-chip${c.used ? ' used' : ''}`} title={CARD_DEFS[c.id]?.desc}>
      <CardIcon id={c.id} size={26} radius={7} iconScale={0.68} />
      <span className="chip-name">{CARD_DEFS[c.id]?.name}</span>
    </span>
  ))
}
