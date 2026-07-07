import { io } from 'socket.io-client'

// In production the server serves this same built client (see
// server/index.js), so the socket just connects same-origin — no URL
// needed at all. In dev, Vite's dev server (5173) and the Node server
// (3001) are different origins, so that needs pointing out explicitly.
// VITE_SERVER_URL always overrides both (e.g. testing against a server on
// the LAN/a VPN from a dev client).
const SERVER_URL = import.meta.env.VITE_SERVER_URL
  || (import.meta.env.DEV ? 'http://26.79.254.185:3001' : undefined)

// Lazily-created singleton — only connects once the player actually enters
// online mode, not on app load.
let socket = null

export function getSocket() {
  if (!socket) {
    socket = io(SERVER_URL, { autoConnect: false })
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
      if (err) { reject(new Error('Сервер не отвечает')); return }
      if (response?.error) { reject(new Error(response.error)); return }
      resolve(response)
    })
  })
}
