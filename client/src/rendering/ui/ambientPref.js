// "Живой фон" setting: animated smoke on/off (off = one still frame).
const KEY = 'chessplus_ambient'
export function isAmbientOn() {
  try { return localStorage.getItem(KEY) !== '0' } catch { return true }
}
export function setAmbientOn(on) {
  try { localStorage.setItem(KEY, on ? '1' : '0') } catch { /* not persisted */ }
  window.dispatchEvent(new Event('chessplus:ambient'))
}
