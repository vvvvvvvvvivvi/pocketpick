import { useCallback, useEffect, useRef, useState } from 'react'
import type { Sketch, Stroke } from '../types'

const COLOURS = [
  { c: '#1f3b34', label: 'Ink' },
  { c: '#d9532f', label: 'Red' },
  { c: '#5e9a72', label: 'Green' },
  { c: '#4f86c6', label: 'Blue' }
]

function smooth(p: [number, number][]): string {
  if (p.length === 1) return `M${p[0][0]} ${p[0][1]}l0.01 0`
  let d = `M${p[0][0].toFixed(1)} ${p[0][1].toFixed(1)}`
  for (let i = 1; i < p.length - 1; i++) {
    const mx = (p[i][0] + p[i + 1][0]) / 2
    const my = (p[i][1] + p[i + 1][1]) / 2
    d += `Q${p[i][0].toFixed(1)} ${p[i][1].toFixed(1)} ${mx.toFixed(1)} ${my.toFixed(1)}`
  }
  const last = p[p.length - 1]
  return d + `L${last[0].toFixed(1)} ${last[1].toFixed(1)}`
}

/** Crop to the drawn area so the icon fills its box when shown small. */
function toSketch(strokes: Stroke[]): Sketch | undefined {
  if (!strokes.length) return undefined
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const s of strokes) for (const [x, y] of s.p) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y) }
  const pad = 6
  const w = Math.max(x1 - x0, 24) + pad * 2
  const h = Math.max(y1 - y0, 24) + pad * 2
  const side = Math.max(w, h) // square viewBox keeps icons undistorted
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2
  return { strokes, vb: [cx - side / 2, cy - side / 2, side, side] }
}

/** Renders a saved sketch as crisp SVG at any size. */
export function SketchIcon({ sketch, fallback }: { sketch?: Sketch; fallback: 'food' | 'things' }) {
  if (!sketch) {
    return (
      <svg className="ic fallback" aria-hidden="true"><use href={fallback === 'food' ? '#i-leaf' : '#i-bag'} /></svg>
    )
  }
  return (
    <svg viewBox={sketch.vb.join(' ')} className="sketch-icon" aria-hidden="true" preserveAspectRatio="xMidYMid meet">
      {sketch.strokes.map((s, i) => (
        <path key={i} d={smooth(s.p)} stroke={s.c} fill="none" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      ))}
    </svg>
  )
}

export function SketchPad({ value, onChange }: { value?: Sketch; onChange: (s: Sketch | undefined) => void }) {
  const cv = useRef<HTMLCanvasElement>(null)
  const strokes = useRef<Stroke[]>(value?.strokes ?? [])
  const current = useRef<Stroke | null>(null)
  const [colour, setColour] = useState(COLOURS[0].c)

  const paint = useCallback(() => {
    const c = cv.current
    if (!c) return
    const ctx = c.getContext('2d')!
    ctx.clearRect(0, 0, c.width, c.height)
    ctx.lineWidth = 3.2
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    for (const s of strokes.current) {
      ctx.strokeStyle = s.c
      ctx.fillStyle = s.c
      if (s.p.length === 1) { ctx.beginPath(); ctx.arc(s.p[0][0], s.p[0][1], 1.6, 0, 6.3); ctx.fill(); continue }
      ctx.beginPath()
      ctx.moveTo(s.p[0][0], s.p[0][1])
      for (let i = 1; i < s.p.length - 1; i++) {
        ctx.quadraticCurveTo(s.p[i][0], s.p[i][1], (s.p[i][0] + s.p[i + 1][0]) / 2, (s.p[i][1] + s.p[i + 1][1]) / 2)
      }
      const l = s.p[s.p.length - 1]
      ctx.lineTo(l[0], l[1])
      ctx.stroke()
    }
  }, [])

  useEffect(() => {
    const c = cv.current!
    const fit = () => {
      const r = c.getBoundingClientRect()
      const d = window.devicePixelRatio || 1
      c.width = Math.round(r.width * d)
      c.height = Math.round(r.height * d)
      c.getContext('2d')!.setTransform(d, 0, 0, d, 0, 0)
      paint()
    }
    fit()
    window.addEventListener('resize', fit)
    return () => window.removeEventListener('resize', fit)
  }, [paint])

  const pos = (e: React.PointerEvent): [number, number] => {
    const r = cv.current!.getBoundingClientRect()
    return [e.clientX - r.left, e.clientY - r.top]
  }
  const commit = () => onChange(toSketch(strokes.current))

  return (
    <div>
      <div className="pad sk">
        <canvas
          ref={cv}
          aria-label="Sketch pad: draw an icon for this item"
          onPointerDown={e => {
            e.currentTarget.setPointerCapture(e.pointerId)
            current.current = { c: colour, p: [pos(e)] }
            strokes.current.push(current.current)
            paint()
          }}
          onPointerMove={e => {
            if (!current.current) return
            current.current.p.push(pos(e))
            paint()
          }}
          onPointerUp={() => { current.current = null; commit() }}
          onPointerCancel={() => { current.current = null; commit() }}
        />
        {!strokes.current.length && <span className="hint">draw it here</span>}
      </div>
      <div className="tools">
        {COLOURS.map(o => (
          <button
            key={o.c}
            type="button"
            className="dot"
            style={{ ['--c' as string]: o.c }}
            aria-pressed={colour === o.c}
            aria-label={o.label}
            onClick={() => setColour(o.c)}
          />
        ))}
        <span className="sp" />
        <button type="button" className="tbtn sk fine" onClick={() => { strokes.current.pop(); paint(); commit() }}>Undo</button>
        <button type="button" className="tbtn sk fine" onClick={() => { strokes.current = []; paint(); commit() }}>Clear</button>
      </div>
    </div>
  )
}
