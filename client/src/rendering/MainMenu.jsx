import { t } from '../i18n'
import { useState } from 'react'
import HowToPlay from './HowToPlay'
import { SettingsButton } from './Settings'
import NamePlate from './NamePlate'
import { FeedbackButton } from './Feedback'
import { Piece, CardIcon } from '../skins/Piece'
import { IconRobot, IconHelp, IconMegaphone, IconPalette } from './ui/Icons'
import './MainMenu.css'

const FAN = [
  { card: 'meteor', r: -15, y: 22 },
  { card: 'freeze', r: -7.5, y: 6 },
  { piece: 'knight', r: 0, y: 0 },
  { card: 'shield', r: 7.5, y: 6 },
  { card: 'barricade', r: 15, y: 22 },
]

// Sandbox has no menu button — it's the dev/test page at /sandbox.
export default function MainMenu({ onPlayOnline, onPlayBot, onOpenPatchNotes, unseenPatch }) {
  const [howToPlayOpen, setHowToPlayOpen] = useState(false)

  return (
    <div className="mm-screen">
      {howToPlayOpen && <HowToPlay onClose={() => setHowToPlayOpen(false)} />}
      <div className="mm-top">
        <NamePlate />
        <button className="ui-btn icon mm-news" onClick={onOpenPatchNotes} aria-label={t('menu.whatsNew')} title={t('menu.whatsNew')} data-testid="menu-news">
          <IconMegaphone size={26} />
          {unseenPatch && <span className="mm-dot" aria-label={t('menu.newBadge')} />}
        </button>
        <FeedbackButton className="mm-mail" />
        <SettingsButton />
      </div>

      <div className="mm-center">
        <h1 className="mm-logo"><b>MIS</b>CHESS</h1>

        <div className="mm-fan" aria-hidden="true">
          {FAN.map((f, i) => (
            <span key={i} className="mm-fan-card" style={{ '--r': `${f.r}deg`, '--y': `${f.y}px`, '--i': i, zIndex: 10 - Math.abs(i - 2) }}>
              {f.card
                ? <CardIcon id={f.card} size={68} radius={10} iconScale={0.5} className="mm-fan-art" />
                : <span className="mm-fan-art light"><Piece type={f.piece} color="black" size={60} center /></span>}
            </span>
          ))}
        </div>

        <div className="mm-buttons">
          <button className="mm-tile hero" data-tilt onClick={onPlayOnline} data-testid="menu-online">
            <span className="mm-tile-title">{t('menu.playOnline')}</span>
            <span className="mm-hero-art">
              <Piece type="pawn" color="white" size={72} center />
              <Piece type="pawn" color="black" size={72} center />
            </span>
          </button>

          <div className="mm-row">
            <button className="mm-tile mode" data-tilt onClick={onPlayBot} data-testid="menu-bot">
              <span className="mm-mode-art bot"><IconRobot /></span>
              <span className="mm-tile-title">{t('menu.vsBot')}</span>
            </button>
          </div>

          <div className="mm-row minor-row">
            <button className="mm-minor" onClick={() => setHowToPlayOpen(true)} data-testid="menu-howto">
              <span className="mm-mi help"><IconHelp /></span>{t('menu.howToPlay')}
            </button>
            <button className="mm-minor off" disabled title={t('menu.soon')}>
              <span className="mm-mi skins"><IconPalette /></span>{t('menu.skins')}
              <span className="mm-soon">{t('menu.soonTag')}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
