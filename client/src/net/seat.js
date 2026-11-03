// The secret seat token the server hands out on create/join (see
// server/rooms.js's newSeat) — kept so a reload or a dropped connection can
// reclaim the same seat via 'rejoin_room'. Per TAB (sessionStorage, which
// survives a reload but isn't shared between tabs) — a second tab of the
// same browser must join as a new player, not grab this one's seat. One
// room at a time: joining or creating another simply overwrites it. Same
// try/catch pattern as nickname.js — without storage, rejoin just isn't
// available.
const STORAGE_KEY = 'chessplus_seat'

export function saveSeat(code, token) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ code, token }))
  } catch {
    // Ignore — this session just can't rejoin after a reload.
  }
}

// The saved token for `code`, or null if we don't hold a seat there.
export function loadSeatToken(code) {
  try {
    const seat = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? 'null')
    return seat?.code === code ? seat.token : null
  } catch {
    return null
  }
}

export function clearSeat() {
  try {
    sessionStorage.removeItem(STORAGE_KEY)
  } catch {
    // Ignore.
  }
}
