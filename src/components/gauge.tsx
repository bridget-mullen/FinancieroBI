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
  const H = 440
  const cx = W / 2
  const cy = 390

  const outerR = 340
  const innerR = outerR * 0.75
  const outerGrayR = outerR + 5
  const labelR = outerR + 32

  // Dynamic needle position based on cumplimiento (% of budget achieved)
  // Clamp between 0 and ~120% for visual purposes
  const needlePct = Math.min(Math.max(cumplimiento / 100, 0), 1.2)

  // Semáforo zone thresholds:
  // RED zone: 0% to (prevYear / budget * 100)%
  // YELLOW zone: from red threshold to 100%
  // GREEN zone: above 100%
  const redThreshold = 0.33 // Fixed: roughly equal thirds for visual balance
  const yellowThreshold = 0.66 // Fixed: roughly equal thirds for visual balance

  // 5 clean labels outside the arc (scaled to 120% max for green zone visibility)
  const maxScale = 1.2 // Show up to 120% on gauge
  const arcLabels = [
    { pct: 0, label: "$0M" },
    { pct: 0.25 * maxScale, label: `$${Math.round(budget * 0.25)}M` },
    { pct: 0.5 * maxScale, label: `$${Math.round(budget * 0.5)}M` },
    { pct: 0.75 * maxScale, label: `$${Math.round(budget * 0.75)}M` },
    { pct: 1 * maxScale, label: `$${Math.round(budget * 10) / 10}M` },
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

  // Create the three zone arcs (as fractions of the full arc)
  // The gauge goes from 0 to 120% (maxScale), so we need to scale zones
  const redEndPct = 1/3 // Equal thirds
  const yellowEndPct = 2/3 // Equal thirds
  const greenEndPct = 1 // Full arc

  const redArc = createArcPath(0, redEndPct, outerR, innerR)
  const yellowArc = createArcPath(redEndPct, yellowEndPct, outerR, innerR)
  const greenArc = createArcPath(yellowEndPct, greenEndPct, outerR, innerR)

  const [gL_x, gL_y] = polarToXY(180, outerGrayR)
  const [gR_x, gR_y] = polarToXY(0, outerGrayR)
  const grayArc = `M ${gL_x} ${gL_y} A ${outerGrayR} ${outerGrayR} 0 0 1 ${gR_x} ${gR_y}`

  // Dynamic needle angle based on actual cumplimiento
  const needleAngleDeg = 180 - (needlePct / maxScale) * 180
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

  const tickR1 = outerR + 2
  const tickR2 = outerR + 12


  const content = (
    <div style={{ width: "100%", position: "relative" }}>
      <svg
        width="100%"
        viewBox={`0 0 ${W} ${H}`}
        style={{ display: "block" }}
      >
        <path d={grayArc} fill="none" stroke="#D0D0D0" strokeWidth={2} />

        {/* Semáforo zones - solid colors, no gradients */}
        <path d={redArc} fill="#E62800" />
        <path d={yellowArc} fill="#F9DC5C" />
        <path d={greenArc} fill="#60A63A" />

        {/* Tick marks + labels OUTSIDE */}
        {arcLabels.map((tick, i) => {
          const angleDeg = 180 - (tick.pct / maxScale) * 180
          const [t1x, t1y] = polarToXY(angleDeg, tickR1)
          const [t2x, t2y] = polarToXY(angleDeg, tickR2)
          const [lx, ly] = polarToXY(angleDeg, labelR)
          // Anchor: left labels start, right labels end, middle ones middle
          const anchor = tick.pct < 0.15 ? "start" : tick.pct > 0.85 ? "end" : "middle"
          // Push edge labels below the arc baseline so they don't overlap
          const yOffset = (tick.pct < 0.05 || tick.pct > 0.95) ? 20 : 0
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

        <polygon
          points={`${tipX},${tipY} ${b1x},${b1y} ${tailX},${tailY} ${b2x},${b2y}`}
          fill="#052F5F"
        />

        <circle cx={cx} cy={cy} r={18} fill="#052F5F" />
        <circle cx={cx} cy={cy} r={11} fill="white" />
        <circle cx={cx} cy={cy} r={5} fill="#052F5F" />

        {/* Prominent % achievement in center */}
        <text
          x={cx} y={cy + 55}
          fontSize="58" fontWeight="900" fill="#052F5F"
          textAnchor="middle" fontFamily="Calibri, Arial, sans-serif"
          style={{ fontFeatureSettings: "'tnum'" }}
        >
          {cumplimiento}%
        </text>
        <text
          x={cx} y={cy + 90}
          fontSize="21" fill="#374151"
          textAnchor="middle" fontFamily="Calibri, Arial, sans-serif"
          fontWeight="700"
        >
          Cumplimiento
        </text>
        {/* Removed value/budget text per client request */}
        {/* Removed indicator circles per client request */}
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
