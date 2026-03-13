"use client"

import { useId } from "react"
import Link from "next/link"

interface GaugeProps {
  value: number      // actual prima in millions
  prevYear: number   // prior year prima in millions
  budget: number     // presupuesto in millions
  clickable?: boolean
}

export function Gauge({ value, prevYear, budget, clickable = true }: GaugeProps) {
  const uniqueId = useId()
  const W = 860
  const H = 720
  const cx = W / 2
  const cy = 390

  const outerR = 340
  const innerR = outerR * 0.75
  const labelR = outerR + 32

  // Arc scale: 0 to budget * 1.05 (5% green overshoot)
  const maxScale = budget * 1.05

  // Zone boundaries as fractions of maxScale
  // Zone 1 (Red/Below last year): 0 to prevYear
  // Zone 2 (Yellow/Growing but below budget): prevYear to budget
  // Zone 3 (Green/Exceeded budget): budget to maxScale
  const redEnd = prevYear / maxScale
  const yellowEnd = budget / maxScale
  const greenEnd = 1.0

  // Premium corporate colors
  const COLORS = {
    red: '#7C1D1D',      // deep burgundy
    yellow: '#92710C',   // dark amber
    green: '#1A5E3B',    // deep forest green
    needle: '#1E293B',   // slate-800
    text: '#1E293B',
    textMuted: '#475569',
    textLight: '#94A3B8',
  }

  // Needle position based on value
  const needleFraction = Math.min(Math.max(value / maxScale, 0), 1)

  // Cumplimiento percentage
  const cumplimiento = Math.round((value / budget) * 100)

  // Growth percentage
  const growth = prevYear > 0 ? ((value - prevYear) / prevYear * 100) : 0

  // Tick labels along the arc exterior
  const arcLabels = [
    { pct: 0 / maxScale, label: "$0M" },
    { pct: 25 / maxScale, label: "$25M" },
    { pct: 50 / maxScale, label: "$50M" },
    { pct: 75 / maxScale, label: "$75M" },
    { pct: 100 / maxScale, label: "$100M" },
    { pct: budget / maxScale, label: `$${budget.toFixed(1)}M` },
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
  const redArc = createArcPath(0, redEnd, outerR, innerR)
  const yellowArc = createArcPath(redEnd, yellowEnd, outerR, innerR)
  const greenArc = createArcPath(yellowEnd, greenEnd, outerR, innerR)

  // Needle geometry
  const needleAngleDeg = 180 - needleFraction * 180
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
            <feDropShadow dx="0" dy="3" stdDeviation="4" floodColor="rgba(0,0,0,0.2)" />
          </filter>
        </defs>

        {/* Arc zones with premium corporate colors */}
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
              <line x1={t1x} y1={t1y} x2={t2x} y2={t2y} stroke="#64748B" strokeWidth={1.5} />
              <text
                x={lx} y={ly + yOffset}
                fontSize="14" fontWeight="600" fill="#64748B"
                textAnchor={anchor}
                dominantBaseline="middle"
                fontFamily="system-ui, -apple-system, sans-serif"
              >
                {tick.label}
              </text>
            </g>
          )
        })}

        {/* Needle - slate-800 */}
        <polygon
          points={`${tipX},${tipY} ${b1x},${b1y} ${tailX},${tailY} ${b2x},${b2y}`}
          fill={COLORS.needle}
        />

        {/* Center hub */}
        <circle cx={cx} cy={cy} r={18} fill={COLORS.needle} />
        <circle cx={cx} cy={cy} r={11} fill="white" />
        <circle cx={cx} cy={cy} r={5} fill={COLORS.needle} />

        {/* Center text - cumplimiento percentage */}
        <text
          x={cx} y={cy + 60}
          fontSize="52" fontWeight="900" fill={COLORS.text}
          textAnchor="middle" fontFamily="system-ui, -apple-system, sans-serif"
          style={{ fontFeatureSettings: "'tnum'" }}
        >
          {cumplimiento}%
        </text>
        <text
          x={cx} y={cy + 88}
          fontSize="20" fontWeight="600" fill={COLORS.textMuted}
          textAnchor="middle" fontFamily="system-ui, -apple-system, sans-serif"
        >
          Cumplimiento
        </text>
        <text
          x={cx} y={cy + 115}
          fontSize="16" fill={COLORS.textLight}
          textAnchor="middle" fontFamily="system-ui, -apple-system, sans-serif"
          style={{ fontFeatureSettings: "'tnum'" }}
        >
          ${value.toFixed(1)}M de ${budget.toFixed(1)}M
        </text>

        {/* Left circle - Prima Neta */}
        <circle cx={circleLX} cy={circleY} r={circleR} fill={COLORS.needle} filter={`url(#${shadowId})`} />
        <text
          x={circleLX} y={circleY + 8}
          fontSize="30" fontWeight="900" fill="white"
          textAnchor="middle" fontFamily="system-ui, -apple-system, sans-serif"
          style={{ fontFeatureSettings: "'tnum'" }}
        >
          ${value.toFixed(1)}M
        </text>
        <text
          x={circleLX} y={circleY + circleR + 22}
          fontSize="14" fontWeight="700" fill={COLORS.textMuted}
          textAnchor="middle" fontFamily="system-ui, -apple-system, sans-serif"
        >
          Prima Neta
        </text>

        {/* Right circle - Crecimiento */}
        <circle
          cx={circleRX}
          cy={circleY}
          r={circleR}
          fill={growth >= 0 ? COLORS.green : COLORS.red}
          filter={`url(#${shadowId})`}
        />
        <text
          x={circleRX} y={circleY + 8}
          fontSize="30" fontWeight="900" fill="white"
          textAnchor="middle" fontFamily="system-ui, -apple-system, sans-serif"
          style={{ fontFeatureSettings: "'tnum'" }}
        >
          {growth >= 0 ? '↑' : '↓'}{Math.abs(growth).toFixed(1)}%
        </text>
        <text
          x={circleRX} y={circleY + circleR + 22}
          fontSize="14" fontWeight="700" fill={COLORS.textMuted}
          textAnchor="middle" fontFamily="system-ui, -apple-system, sans-serif"
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
