"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"

interface GaugeProps {
  value: number
  prevYear?: number
  budget?: number
  clickable?: boolean
}

export function Gauge({ value, prevYear = 88.9, budget = 129.5, clickable = true }: GaugeProps) {
  const [anim, setAnim] = useState(0)
  const raf = useRef(0)

  const min = 80, max = 150
  const range = max - min
  const pct = Math.max(0.01, Math.min(0.99, (value - min) / range))

  useEffect(() => {
    const dur = 1400, t0 = performance.now()
    const tick = (now: number) => {
      const p = Math.min((now - t0) / dur, 1)
      setAnim(pct * (1 - Math.pow(1 - p, 3)))
      if (p < 1) raf.current = requestAnimationFrame(tick)
    }
    raf.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf.current)
  }, [pct])

  // ─── SVG Geometry: 180° semicircle ───
  const W = 500, H = 290
  const cx = W / 2, cy = 230
  const ro = 195        // outer radius (massive)
  const ri = 140        // inner radius (thick band = 55px)
  const borderR = ro + 8 // grey outer border
  const startA = 180     // left (180°)
  const sweepA = 180     // to right (360°)
  const numSegs = 10     // 10 blocks with gaps
  const gapDeg = 2       // gap between segments

  const toXY = (deg: number, r: number) => {
    const rad = (deg * Math.PI) / 180
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) }
  }

  const descArc = (s: number, e: number, rOut: number, rIn: number) => {
    const p1 = toXY(s, rOut), p2 = toXY(e, rOut), p3 = toXY(e, rIn), p4 = toXY(s, rIn)
    const lg = Math.abs(e - s) > 180 ? 1 : 0
    return `M${p1.x},${p1.y} A${rOut},${rOut} 0 ${lg} 1 ${p2.x},${p2.y} L${p3.x},${p3.y} A${rIn},${rIn} 0 ${lg} 0 ${p4.x},${p4.y} Z`
  }

  // ─── Color segments: 10 blocks, GREEN → YELLOW → ORANGE → RED ───
  // Vibrant, high-contrast, Power BI Premium style — NO PASTELS
  const colors = [
    "#1B8A2D", // deep green
    "#2DA83E", // green
    "#6BBF1A", // yellow-green
    "#C5D900", // lime-yellow
    "#F5D000", // golden yellow
    "#F5A623", // amber orange
    "#F57C00", // deep orange
    "#E64A19", // red-orange
    "#D32F2F", // red
    "#B71C1C", // dark red / critical
  ]

  const segDeg = (sweepA - gapDeg * (numSegs - 1)) / numSegs

  // ─── Needle ───
  const needleAngle = startA + anim * sweepA
  const nRad = (needleAngle * Math.PI) / 180
  const needleLen = ri - 10  // needle tip reaches inner arc
  const needleTip = { x: cx + (ro - 8) * Math.cos(nRad), y: cy + (ro - 8) * Math.sin(nRad) }
  const bw = 8 // base width for robust needle
  const b1 = { x: cx + bw * Math.cos(nRad + Math.PI / 2), y: cy + bw * Math.sin(nRad + Math.PI / 2) }
  const b2 = { x: cx + bw * Math.cos(nRad - Math.PI / 2), y: cy + bw * Math.sin(nRad - Math.PI / 2) }

  // ─── Scale labels (every segment boundary) ───
  const scaleCount = 8
  const scaleValues = Array.from({ length: scaleCount + 1 }, (_, i) => min + (range * i) / scaleCount)

  // Budget marker
  const budPct = Math.max(0, Math.min(1, (budget - min) / range))
  const budAngle = startA + budPct * sweepA

  // Previous year marker
  const pyPct = Math.max(0, Math.min(1, (prevYear - min) / range))
  const pyAngle = startA + pyPct * sweepA

  const GaugeContent = (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full mx-auto block" style={{ maxHeight: '55vh' }}>
      {/* Grey outer border arc */}
      <path d={descArc(startA - 1, startA + sweepA + 1, borderR, borderR - 6)} fill="#6B6B6B" />

      {/* Background track (dark grey behind segments) */}
      <path d={descArc(startA, startA + sweepA, ro, ri)} fill="#D1D5DB" />

      {/* 10 color segment blocks with gaps */}
      {colors.map((color, i) => {
        const sA = startA + i * (segDeg + gapDeg)
        const eA = sA + segDeg
        return <path key={i} d={descArc(sA, eA, ro, ri)} fill={color} />
      })}

      {/* Inner shadow/depth ring */}
      <path d={descArc(startA, startA + sweepA, ri + 2, ri - 2)} fill="#E5E7EB" opacity={0.5} />

      {/* Scale tick marks and $ labels */}
      {scaleValues.map((val, i) => {
        const valPct = (val - min) / range
        const angle = startA + valPct * sweepA
        const outerTick = toXY(angle, ro + 10)
        const innerTick = toXY(angle, ro + 2)
        const labelPos = toXY(angle, ro + 22)
        return (
          <g key={val}>
            <line x1={outerTick.x} y1={outerTick.y} x2={innerTick.x} y2={innerTick.y}
              stroke="#4B5563" strokeWidth={2} />
            <text x={labelPos.x} y={labelPos.y} fontSize="11" fill="#4B5563"
              textAnchor="middle" dominantBaseline="middle" fontWeight="600" fontFamily="Calibri, sans-serif">
              ${val.toFixed(0)}M
            </text>
          </g>
        )
      })}

      {/* Budget marker (green triangle + label) */}
      {(() => {
        const bOuter = toXY(budAngle, ro + 10)
        const bLabel = toXY(budAngle, ro + 34)
        const tri1 = toXY(budAngle - 2, ro + 18)
        const tri2 = toXY(budAngle + 2, ro + 18)
        return (
          <g>
            <polygon points={`${bOuter.x},${bOuter.y} ${tri1.x},${tri1.y} ${tri2.x},${tri2.y}`} fill="#15803D" />
            <text x={bLabel.x} y={bLabel.y} fontSize="10" fill="#15803D"
              textAnchor="middle" dominantBaseline="middle" fontWeight="800" fontFamily="Calibri, sans-serif">
              Meta: ${budget.toFixed(1)}M
            </text>
          </g>
        )
      })()}

      {/* Previous year marker line */}
      {(() => {
        const pyOuter = toXY(pyAngle, ro + 2)
        const pyInner = toXY(pyAngle, ri - 4)
        return <line x1={pyOuter.x} y1={pyOuter.y} x2={pyInner.x} y2={pyInner.y}
          stroke="#1F2937" strokeWidth={3} strokeDasharray="6 3" />
      })()}

      {/* Robust needle */}
      <polygon
        points={`${needleTip.x},${needleTip.y} ${b1.x},${b1.y} ${b2.x},${b2.y}`}
        fill="#2D2D2D"
        stroke="#1a1a1a"
        strokeWidth={1}
      />
      {/* Large center hub — white/grey like reference */}
      <circle cx={cx} cy={cy} r={22} fill="#F5F5F5" stroke="#BDBDBD" strokeWidth={3} />
      <circle cx={cx} cy={cy} r={12} fill="#E0E0E0" stroke="#9E9E9E" strokeWidth={2} />
      <circle cx={cx} cy={cy} r={5} fill="#757575" />

      {/* LOW label — left extreme */}
      <text x={toXY(startA, ro + 8).x - 25} y={cy + 20} fontSize="13" fill="#1B8A2D"
        textAnchor="middle" fontWeight="900" fontFamily="Calibri, sans-serif"
        letterSpacing="1">
        LOW
      </text>

      {/* CRITICAL label — right extreme */}
      <text x={toXY(startA + sweepA, ro + 8).x + 35} y={cy + 20} fontSize="13" fill="#B71C1C"
        textAnchor="middle" fontWeight="900" fontFamily="Calibri, sans-serif"
        letterSpacing="1">
        CRITICAL
      </text>

      {/* Value text — bold, centered below */}
      <text x={cx} y={cy + 50} fontSize="36" fontWeight="900" fill="#111827"
        textAnchor="middle" fontFamily="Calibri, sans-serif">
        ${value.toFixed(1)}M
      </text>
      <text x={cx} y={cy + 68} fontSize="12" fill="#6B7280"
        textAnchor="middle" fontFamily="Calibri, sans-serif" fontWeight="500">
        Prima neta cobrada
      </text>
    </svg>
  )

  if (clickable) {
    return <Link href="/tabla-detalle" className="block">{GaugeContent}</Link>
  }
  return GaugeContent
}
