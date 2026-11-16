import { io } from 'socket.io-client'
import { SERVER_URL } from './serverUrl'
import { visitorId } from '../analytics'

// Lazily-created singleton — only connects once the player actually enters
// online mode, not on app load.
let socket = null

export function getSocket() {
  if (!socket) {
    // auth.vid: anonymous analytics id, so the server can count this
    // visitor's rooms/matches (server/analytics.js).
    socket = io(SERVER_URL, { autoConnect: false, auth: { vid: visitorId } })
  }
  return socket
}

export function connectSocket() {
  const s = getSocket()
  if (!s.connected) s.connect()
  return s
}

export function disconnectSocket() {
  if (socket && socket.connected) socket.disconnect()
}

// Promise-wrapped emit-with-ack, since every client->server request in this
// game expects a single acknowledgement (room code, error, etc).
export function request(event, payload) {
  return new Promise((resolve, reject) => {
    const s = getSocket()
    s.timeout(6000).emit(event, payload, (err, response) => {
      if (err) { reject(new Error('err.noResponse')); return }
      if (response?.error) { reject(new Error(response.error)); return }
      resolve(response)
    })
  })
}
