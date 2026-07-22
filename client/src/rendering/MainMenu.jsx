import { useState } from 'react'
import HowToPlay from './HowToPlay'
import { PIECE_ICONS } from './pieceIcons'
import './MainMenu.css'

// Main menu — chunky cartoon-boardgame look (Baloo 2 display font, thick
// outlines, punchy drop shadows): one big "Играть онлайн" hero CTA, a row
// of three secondary cards, and a disabled "Скины" banner underneath.
// Design handed off from a separate design pass (client/design/Chess Plus
// Main Menu.dc.html) and transferred here 1:1, minus its own floating
// coins/background/version-settings row — those are MenuLayout.jsx's job
// now, mounted once at the app root so they don't reset (or animate away)
// every time this screen mounts/unmounts (see MenuLayout.jsx).
//
// "Как играть" lives only here — it used to be duplicated into the online
// lobby/waiting-room screens too, which just meant it could show up at
// unpredictable points instead of always being the same one, easy-to-find
// place to check the rules.
export default function MainMenu({ onPlayOnline, onSandbox, onOpenPatchNotes, unseenPatch }) {
  const [howToPlayOpen, setHowToPlayOpen] = useState(false)

  return (
    <div className="mm-screen">
      {howToPlayOpen && <HowToPlay onClose={() => setHowToPlayOpen(false)} />}

      {/* The tilt lives on an inner span — the page-transition animations
         (PageTransition.css) drive `transform` on .mm-logo itself, and a
         static rotate there would get overridden mid-animation (logo
         snapping straight, then tilting back). */}
      <div className="mm-logo">
        <span className="mm-logo-tilt">
          CHESS<span className="mm-logo-plus">+</span>
        </span>
      </div>

      <button className="mm-hero" onClick={onPlayOnline}>
        <span className="mm-hero-badge">
          <span className="mm-hero-piece white">{PIECE_ICONS.white.pawn}</span>
          <span className="mm-hero-piece black">{PIECE_ICONS.black.pawn}</span>
        </span>
        <span className="mm-hero-title">Играть онлайн</span>
      </button>

      <div className="mm-row">
        <button className="mm-card mm-card-sandbox" onClick={onSandbox}>
          <span className="mm-card-icon">
            <span className="mm-icon-flask">
              <span className="mm-icon-flask-neck" />
            </span>
          </span>
          <span className="mm-card-title">Песочница</span>
        </button>

        <button className="mm-card mm-card-howto" onClick={() => setHowToPlayOpen(true)}>
          <span className="mm-card-icon">
            <span className="mm-icon-question">?</span>
          </span>
          <span className="mm-card-title">Как играть</span>
        </button>

        <button className={`mm-card mm-card-patchnotes${unseenPatch ? ' unseen' : ''}`} onClick={onOpenPatchNotes}>
          {unseenPatch && <span className="mm-card-badge-new">NEW</span>}
          <span className="mm-card-icon">
            <span className="mm-icon-scroll">
              <span />
              <span />
              <span />
            </span>
          </span>
          <span className="mm-card-title">Что нового</span>
        </button>
      </div>

      <div className="mm-skins-banner" title="Скоро">
        <span className="mm-skins-icon">
          <span className="mm-icon-shirt" />
        </span>
        <span className="mm-skins-label">Скины</span>
        <span className="mm-skins-spacer" />
        <span className="mm-skins-tag">СКОРО</span>
      </div>
    </div>
  )
}
