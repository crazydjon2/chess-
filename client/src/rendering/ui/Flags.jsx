// Inline SVG flags for the language picker (emoji flags don't render on Windows).
// All drawn on a 30×20 canvas; simplified where the real flag is too detailed for ~28px.

const star = (cx, cy, r, rot = 0) => {
  const pts = []
  for (let i = 0; i < 10; i++) {
    const a = (Math.PI / 5) * i - Math.PI / 2 + rot
    const rr = i % 2 ? r * 0.4 : r
    pts.push(`${(cx + rr * Math.cos(a)).toFixed(2)},${(cy + rr * Math.sin(a)).toFixed(2)}`)
  }
  return pts.join(' ')
}

const FLAGS = {
  en: (
    <>
      <rect width="30" height="20" fill="#012169" />
      <path d="M0,0 30,20 M30,0 0,20" stroke="#fff" strokeWidth="4" />
      <path d="M0,0 30,20 M30,0 0,20" stroke="#C8102E" strokeWidth="1.6" />
      <path d="M15,0 V20 M0,10 H30" stroke="#fff" strokeWidth="6" />
      <path d="M15,0 V20 M0,10 H30" stroke="#C8102E" strokeWidth="3.4" />
    </>
  ),
  ru: (
    <>
      <rect width="30" height="20" fill="#fff" />
      <rect y="6.67" width="30" height="6.67" fill="#0039A6" />
      <rect y="13.33" width="30" height="6.67" fill="#D52B1E" />
    </>
  ),
  uk: (
    <>
      <rect width="30" height="10" fill="#0057B7" />
      <rect y="10" width="30" height="10" fill="#FFD700" />
    </>
  ),
  es: (
    <>
      <rect width="30" height="20" fill="#AA151B" />
      <rect y="5" width="30" height="10" fill="#F1BF00" />
    </>
  ),
  pt: (
    <>
      <rect width="30" height="20" fill="#DA291C" />
      <rect width="12" height="20" fill="#046A38" />
      <circle cx="12" cy="10" r="4" fill="#FFE900" />
      <circle cx="12" cy="10" r="2.4" fill="#DA291C" />
    </>
  ),
  fr: (
    <>
      <rect width="30" height="20" fill="#fff" />
      <rect width="10" height="20" fill="#002395" />
      <rect x="20" width="10" height="20" fill="#ED2939" />
    </>
  ),
  de: (
    <>
      <rect width="30" height="20" fill="#000" />
      <rect y="6.67" width="30" height="6.67" fill="#DD0000" />
      <rect y="13.33" width="30" height="6.67" fill="#FFCE00" />
    </>
  ),
  it: (
    <>
      <rect width="30" height="20" fill="#fff" />
      <rect width="10" height="20" fill="#009246" />
      <rect x="20" width="10" height="20" fill="#CE2B37" />
    </>
  ),
  pl: (
    <>
      <rect width="30" height="10" fill="#fff" />
      <rect y="10" width="30" height="10" fill="#DC143C" />
    </>
  ),
  tr: (
    <>
      <rect width="30" height="20" fill="#E30A17" />
      <circle cx="11" cy="10" r="5" fill="#fff" />
      <circle cx="12.3" cy="10" r="4" fill="#E30A17" />
      <polygon points={star(18.2, 10, 2.4, -Math.PI / 10)} fill="#fff" />
    </>
  ),
  zh: (
    <>
      <rect width="30" height="20" fill="#EE1C25" />
      <polygon points={star(5, 5, 3)} fill="#FFFF00" />
      <polygon points={star(10, 2, 1)} fill="#FFFF00" />
      <polygon points={star(12, 4, 1)} fill="#FFFF00" />
      <polygon points={star(12, 7, 1)} fill="#FFFF00" />
      <polygon points={star(10, 9, 1)} fill="#FFFF00" />
    </>
  ),
  ja: (
    <>
      <rect width="30" height="20" fill="#fff" />
      <circle cx="15" cy="10" r="6" fill="#BC002D" />
    </>
  ),
  ko: (
    <>
      <rect width="30" height="20" fill="#fff" />
      <g transform="rotate(33.7 15 10)">
        <path d="M10,10 a5,5 0 0 1 10,0 a2.5,2.5 0 0 1 -5,0 a2.5,2.5 0 0 0 -5,0" fill="#CD2E3A" />
        <path d="M10,10 a5,5 0 0 0 10,0 a2.5,2.5 0 0 0 -5,0 a2.5,2.5 0 0 1 -5,0" fill="#0047A0" />
      </g>
      <g stroke="#000" strokeWidth="0.9">
        <path d="M4,3.2 l2.6,-1.8 M4.6,4 l2.6,-1.8 M5.2,4.8 l2.6,-1.8" />
        <path d="M22.2,15.2 l2.6,1.8 M22.8,14.4 l2.6,1.8 M23.4,13.6 l2.6,1.8" />
        <path d="M4,16.8 l2.6,1.8 M4.6,16 l2.6,1.8 M5.2,15.2 l2.6,1.8" />
        <path d="M22.2,4.8 l2.6,-1.8 M22.8,5.6 l2.6,-1.8 M23.4,6.4 l2.6,-1.8" />
      </g>
    </>
  ),
}

export function Flag({ code, className = '' }) {
  const body = FLAGS[code]
  if (!body) return null
  return (
    <svg className={`flag ${className}`} viewBox="0 0 30 20" aria-hidden="true" preserveAspectRatio="xMidYMid slice">
      {body}
    </svg>
  )
}
