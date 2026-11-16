import { useEffect, useState } from 'react'
import { t, getLang } from '../i18n'
import Modal from './ui/Modal'
import { IconMail } from './ui/Icons'
import { track, visitorId } from '../analytics'
import { API_BASE } from '../net/serverUrl'
import './Feedback.css'

const MAX = 2000

// Free-text feedback → POST /api/feedback (server/feedback.js stores it and
// emails it to the owner).
function FeedbackModal({ onClose }) {
  const [text, setText] = useState('')
  const [trap, setTrap] = useState('') // honeypot: invisible to people, bots fill it
  const [state, setState] = useState('idle') // idle | sending | sent | error
  const [openedAt] = useState(() => Date.now())
  useEffect(() => { track('feedback_open') }, [])

  async function send() {
    if (!text.trim() || state === 'sending') return
    setState('sending')
    try {
      const res = await fetch(`${API_BASE}/api/feedback`, {
        method: 'POST',
        // hp + ms: anti-spam signals checked by server/feedback.js
        body: JSON.stringify({ text, vid: visitorId, lang: getLang(), page: location.pathname, hp: trap, ms: Date.now() - openedAt }),
      })
      setState(res.ok ? 'sent' : 'error')
    } catch {
      setState('error')
    }
  }

  return (
    <Modal title={t('feedback.title')} onClose={onClose}>
      {state === 'sent' ? (
        <>
          <p className="fb-thanks" data-testid="feedback-thanks">{t('feedback.thanks')}</p>
          <button className="ui-btn primary big po-modal-submit" onClick={onClose}>{t('common.close')}</button>
        </>
      ) : (
        <>
          <textarea
            className="po-nick-input fb-text"
            value={text}
            maxLength={MAX}
            autoFocus
            placeholder={t('feedback.placeholder')}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) send() }}
            aria-label={t('feedback.title')}
            data-testid="feedback-text"
          />
          <input
            className="fb-hp"
            type="text"
            name="website"
            tabIndex={-1}
            autoComplete="off"
            aria-hidden="true"
            value={trap}
            onChange={e => setTrap(e.target.value)}
          />
          {state === 'error' && <p className="po-hint fb-error">{t('feedback.error')}</p>}
          <button
            className="ui-btn primary big po-modal-submit"
            onClick={send}
            disabled={!text.trim() || state === 'sending'}
            data-testid="feedback-send"
          >{t('feedback.send')}</button>
        </>
      )}
    </Modal>
  )
}

// Envelope icon button for screen headers; opens the form.
export function FeedbackButton({ className = "" }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button className={`ui-btn icon ${className}`} onClick={() => setOpen(true)} aria-label={t('feedback.button')} title={t('feedback.button')} data-testid="feedback-btn">
        <IconMail size={26} />
      </button>
      {open && <FeedbackModal onClose={() => setOpen(false)} />}
    </>
  )
}
