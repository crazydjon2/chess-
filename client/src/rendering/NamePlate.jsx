import { useState } from 'react'
import { t } from '../i18n'
import { useNickname } from '../nickname'
import Modal from './ui/Modal'

// The player's name chip with rename — on every non-game screen header.
export default function NamePlate() {
  const [nickname, setNickname] = useNickname()
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(nickname)
  const initial = (nickname || '?').trim().charAt(0).toUpperCase() || '?'
  const done = () => { const v = draft.trim(); if (v) setNickname(v); setOpen(false) }
  return (
    <>
      <button className="po-me" onClick={() => { setDraft(nickname); setOpen(true) }} aria-label={t('lobby.nickname')} data-testid="nick-btn">
        <span className="po-me-ini">{initial}</span>
        <span className="po-me-name">{nickname || t('lobby.player')}</span>
      </button>
      {open && (
        <Modal title={t('lobby.nickname')} onClose={() => setOpen(false)}>
          <input
            className="po-nick-input"
            type="text"
            value={draft}
            maxLength={20}
            autoFocus
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') done() }}
            aria-label={t('lobby.nickname')}
            data-testid="nick-input"
          />
          <button className="ui-btn primary big po-modal-submit" onClick={done}>{t('common.done')}</button>
        </Modal>
      )}
    </>
  )
}
