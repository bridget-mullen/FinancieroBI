"use client"

import { useId } from "react"
import Link from "next/link"

interface GaugeProps {
  value: number
  prevYear?: number
  budget?: number
  clickable?: boolean
  cumplimiento?: number
  crecimiento?: number
}

export function Gauge({ value, prevYear = 0, budget = 129.5, clickable = true, cumplimiento = 0, crecimiento = 0 }: GaugeProps) {
  const uniqueId = useId()
  const W = 860
  const H = 720
  const cx = W / 2
  const cy = 390

  const outerR = 340
  const innerR = outerR * 0.75
  const labelR = outerR + 32

  // Business logic constants (in millions)
  const CURRENT_VALUE = 98.5 // Current prima neta
  const BUDGET = 129.5 // Budget target
  const MAX_SCALE = 136 // 129.5 * 1.05 = ~136 for 5% green overflow zone

  // Arc zone thresholds as fractions of MAX_SCALE (136M)
  // Zone 1 (Red): $0 to $98.5M → 98.5/136 = 0.724
  // Zone 2 (Yellow): $98.5M to $129.5M → 129.5/136 = 0.952
  // Zone 3 (Green): $129.5M to $136M → 1.0
  const redEndPct = CURRENT_VALUE / MAX_SCALE // 0.724
  const yellowEndPct = BUDGET / MAX_SCALE // 0.952
  const greenEndPct = 1.0

  // Premium colors
  const COLORS = {
    red: '#8B1A1A', // deep burgundy/tinto elegante
    yellow: '#B8860B', // dark goldenrod/ámbar dorado
    green: '#1B6B4A', // deep emerald/verde esmeralda oscuro
    needle: '#2D3748', // warm charcoal
    navy: '#0A1628', // deep navy for circles
    text: '#0A1628', // primary text
    textMuted: '#6B7280',
    textLight: '#9CA3AF',
  }

  // Needle position: hardcoded to $98.5M on 0-136M scale
  const needlePct = CURRENT_VALUE / MAX_SCALE // 0.724

  // 6 tick labels along the arc exterior
  const arcLabels = [
    { pct: 0 / MAX_SCALE, label: "$0M" },
    { pct: 25 / MAX_SCALE, label: "$25M" },
    { pct: 50 / MAX_SCALE, label: "$50M" },
    { pct: 75 / MAX_SCALE, label: "$75M" },
    { pct: 98.5 / MAX_SCALE, label: "$98.5M" },
    { pct: 129.5 / MAX_SCALE, label: "$129.5M" },
  ]

  function polarToXY(angleDeg: number, r: number): [number, number] {
    const rad = (angleDeg * Math.PI) / 180
    return [cx + r * Math.cos(rad), cy - r * Math.sin(rad)]
  }

  // Create arc path helper
  function createArcPath(startPct: number, endPct: number, outer: number, inner: number): string {
    const startAngle = 180 - startPct * 180
    const endAngle = 180 - endPct * 180
    const [outerStartX, outerStartY] = polarToXY(startAngle, outer)
    const [outerEndX, outerEndY] = polarToXY(endAngle, outer)
    const [innerEndX, innerEndY] = polarToXY(endAngle, inner)
    const [innerStartX, innerStartY] = polarToXY(startAngle, inner)
    const largeArc = Math.abs(endPct - startPct) > 0.5 ? 1 : 0
    return [
      `M ${outerStartX} ${outerStartY}`,
      `A ${outer} ${outer} 0 ${largeArc} 1 ${outerEndX} ${outerEndY}`,
      `L ${innerEndX} ${innerEndY}`,
      `A ${inner} ${inner} 0 ${largeArc} 0 ${innerStartX} ${innerStartY}`,
      `Z`,
    ].join(" ")
  }

  // Create the three zone arcs
  const redArc = createArcPath(0, redEndPct, outerR, innerR)
  const yellowArc = createArcPath(redEndPct, yellowEndPct, outerR, innerR)
  const greenArc = createArcPath(yellowEndPct, greenEndPct, outerR, innerR)

  // Needle geometry
  const needleAngleDeg = 180 - needlePct * 180
  const needleLen = outerR - 8
  const [tipX, tipY] = polarToXY(needleAngleDeg, needleLen)

  const baseHalfWidth = 7
  const perpRad = ((needleAngleDeg + 90) * Math.PI) / 180
  const b1x = cx + baseHalfWidth * Math.cos(perpRad)
  const b1y = cy - baseHalfWidth * Math.sin(perpRad)
  const b2x = cx - baseHalfWidth * Math.cos(perpRad)
  const b2y = cy + baseHalfWidth * Math.sin(perpRad)

  const tailLen = 20
  const [tailX, tailY] = polarToXY(needleAngleDeg + 180, tailLen)

  // Tick marks
  const tickR1 = outerR + 2
  const tickR2 = outerR + 12

  // Bottom circles (Mickey ears)
  const circleR = 62
  const circleY = cy + 200
  const circleLX = cx - 120
  const circleRX = cx + 120

  // Drop shadow filter ID
  const shadowId = `shadow-${uniqueId}`

  const content = (
    <div style={{ width: "100%", position: "relative" }}>
      <svg
        width="100%"
        viewBox={`0 0 ${W} ${H}`}
        style={{ display: "block" }}
      >
        {/* Drop shadow filter for circles */}
        <defs>
          <filter id={shadowId} x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="rgba(0,0,0,0.2)" />
          </filter>
          {/* Gradient definitions for subtle zone transitions */}
          <linearGradient id={`redGrad-${uniqueId}`} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#7A1515" />
            <stop offset="100%" stopColor="#8B1A1A" />
          </linearGradient>
          <linearGradient id={`yellowGrad-${uniqueId}`} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#A67807" />
            <stop offset="100%" stopColor="#B8860B" />
          </linearGradient>
          <linearGradient id={`greenGrad-${uniqueId}`} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#165C3F" />
            <stop offset="100%" stopColor="#1B6B4A" />
          </linearGradient>
        </defs>

        {/* Arc zones with premium colors */}
        <path d={redArc} fill={COLORS.red} />
        <path d={yellowArc} fill={COLORS.yellow} />
        <path d={greenArc} fill={COLORS.green} />

        {/* Tick marks + labels OUTSIDE */}
        {arcLabels.map((tick, i) => {
          const angleDeg = 180 - tick.pct * 180
          const [t1x, t1y] = polarToXY(angleDeg, tickR1)
          const [t2x, t2y] = polarToXY(angleDeg, tickR2)
          const [lx, ly] = polarToXY(angleDeg, labelR)
          // Anchor: left labels start, right labels end, middle ones middle
          const anchor = tick.pct < 0.15 ? "start" : tick.pct > 0.85 ? "end" : "middle"
          // Push edge labels below the arc baseline so they don't overlap
          const yOffset = tick.pct < 0.05 ? 20 : tick.pct > 0.9 ? 15 : 0
          return (
            <g key={i}>
              <line x1={t1x} y1={t1y} x2={t2x} y2={t2y} stroke="#9CA3AF" strokeWidth={1.5} />
              <text
                x={lx} y={ly + yOffset}
                fontSize="15" fontWeight="700" fill="#374151"
                textAnchor={anchor}
                dominantBaseline="middle"
                fontFamily="Calibri, Arial, sans-serif"
              >
                {tick.label}
              </text>
            </g>
          )
        })}

        {/* Needle - warm charcoal */}
        <polygon
          points={`${tipX},${tipY} ${b1x},${b1y} ${tailX},${tailY} ${b2x},${b2y}`}
          fill={COLORS.needle}
        />

        {/* Center hub */}
        <circle cx={cx} cy={cy} r={18} fill={COLORS.needle} />
        <circle cx={cx} cy={cy} r={11} fill="white" />
        <circle cx={cx} cy={cy} r={5} fill={COLORS.needle} />

        {/* Center text - big number showing current value */}
        <text
          x={cx} y={cy + 55}
          fontSize="48" fontWeight="900" fill={COLORS.text}
          textAnchor="middle" fontFamily="Calibri, Arial, sans-serif"
          style={{ fontFeatureSettings: "'tnum'" }}
        >
          ${CURRENT_VALUE}M
        </text>
        <text
          x={cx} y={cy + 85}
          fontSize="18" fill={COLORS.textMuted}
          textAnchor="middle" fontFamily="Calibri, Arial, sans-serif"
        >
          de ${BUDGET}M
        </text>
        <text
          x={cx} y={cy + 110}
          fontSize="14" fill={COLORS.textLight}
          textAnchor="middle" fontFamily="Calibri, Arial, sans-serif"
        >
          Presupuesto
        </text>

        {/* Left circle - Cumplimiento (76%) */}
        <circle cx={circleLX} cy={circleY} r={circleR} fill={COLORS.navy} filter={`url(#${shadowId})`} />
        <text
          x={circleLX} y={circleY + 8}
          fontSize="32" fontWeight="900" fill="white"
          textAnchor="middle" fontFamily="Calibri, Arial, sans-serif"
          style={{ fontFeatureSettings: "'tnum'" }}
        >
          76%
        </text>
        <text
          x={circleLX} y={circleY + circleR + 22}
          fontSize="14" fontWeight="700" fill="#374151"
          textAnchor="middle" fontFamily="Calibri, Arial, sans-serif"
        >
          Cumplimiento
        </text>

        {/* Right circle - Crecimiento (↑10.8%) */}
        <circle cx={circleRX} cy={circleY} r={circleR} fill={COLORS.green} filter={`url(#${shadowId})`} />
        <text
          x={circleRX} y={circleY + 8}
          fontSize="32" fontWeight="900" fill="white"
          textAnchor="middle" fontFamily="Calibri, Arial, sans-serif"
          style={{ fontFeatureSettings: "'tnum'" }}
        >
          ↑10.8%
        </text>
        <text
          x={circleRX} y={circleY + circleR + 22}
          fontSize="14" fontWeight="700" fill="#374151"
          textAnchor="middle" fontFamily="Calibri, Arial, sans-serif"
        >
          Crecimiento
        </text>
      </svg>
    </div>
  )

  if (clickable) {
    return (
      <Link href="/tabla-detalle" className="block">
        {content}
      </Link>
    )
  }
  return content
}
