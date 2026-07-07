import { useRef } from 'react'

// Canvas layer for particles, card animations, etc.
// pointer-events: none — never intercepts clicks
export default function EffectLayer({ width, height }) {
  const canvasRef = useRef(null)

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        pointerEvents: 'none',
        zIndex: 3,
      }}
    />
  )
}
