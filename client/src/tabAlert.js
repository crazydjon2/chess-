// Blinks the tab title while the page is in the background, until the
// player looks at it again — for "someone joined" / "rematch offered" moments
// that happen while they're in another tab. No permission needed.
let stopCurrent = null

export function flashTitle(text) {
  if (typeof document === 'undefined' || !document.hidden) return
  stopCurrent?.()
  const original = document.title
  const id = setInterval(() => { document.title = document.title === text ? original : text }, 900)
  const stop = () => {
    clearInterval(id)
    document.title = original
    document.removeEventListener('visibilitychange', onVisible)
    stopCurrent = null
  }
  const onVisible = () => { if (!document.hidden) stop() }
  document.addEventListener('visibilitychange', onVisible)
  stopCurrent = stop
}
