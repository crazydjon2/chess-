import { t } from '../i18n'
// Bo3 scoreboard — shows the round number plus each side's win-dots (filled
// as rounds are won) instead of a plain "1:0" pill, so who's ahead and how
// close to winning the match reads at a glance rather than needing parsing.
// Labeled by nickname, not color — colors swap every round (see
// matchEngine.js), so "Белые"/"Чёрные" would silently relabel whoever's
// ahead depending on which round it is, instead of tracking the same person
// across the whole match. Falls back to the color name only if a player
// genuinely has no nickname yet.
export default function MatchScoreBoard({ round, white, black, whiteName, blackName, roundsToWin = 2 }) {
  const dots = (score) =>
    Array.from({ length: roundsToWin }, (_, i) => (
      <span key={i} className={`msb-dot${i < score ? ' filled' : ''}`} />
    ))

  return (
    <div className="match-scoreboard">
      <div className="msb-side msb-white">
        <span className="msb-label" title={whiteName || t('common.white')}>{whiteName || t('common.white')}</span>
        <div className="msb-dots">{dots(white)}</div>
      </div>
      <div className="msb-center">
        <span className="msb-round-num">{round}</span>
        <span className="msb-round-label">{t('score.round')}</span>
      </div>
      <div className="msb-side msb-black">
        <div className="msb-dots">{dots(black)}</div>
        <span className="msb-label" title={blackName || t('common.black')}>{blackName || t('common.black')}</span>
      </div>
    </div>
  )
}
