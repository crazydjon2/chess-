// In production the server serves this same built client (see
// server/index.js), so everything is same-origin — no URL needed at all. In
// dev, Vite's dev server (5173) and the Node server (3001) are different
// origins, so that needs pointing out explicitly — same host the page was
// opened on, so localhost, LAN and VPN addresses all reach the server.
// VITE_SERVER_URL always overrides both (e.g. testing against a server on
// another machine from a dev client).
export const SERVER_URL = import.meta.env.VITE_SERVER_URL
  || (import.meta.env.DEV ? `http://${window.location.hostname}:3001` : undefined)

// Base for plain HTTP calls (/api/...): '' = same origin.
export const API_BASE = SERVER_URL ?? ''
