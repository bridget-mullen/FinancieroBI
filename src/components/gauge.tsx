"use client"

import Link from "next/link"

interface GaugeProps {
  value: number
  prevYear?: number
  budget?: number
  clickable?: boolean
  cumplimiento?: number
  crecimiento?: number
}

export function Gauge({ value, budget = 129.5, clickable = true, cumplimiento = 0, crecimiento = 0 }: GaugeProps) {
  const W = 820
  const H = 720
  const cx = W / 2
  const cy = 380

  const outerR = 340
  const innerR = outerR * 0.75
  const outerGrayR = outerR + 5
  const labelR = outerR + 28

  const NEEDLE_PCT = 0.75

  // Arc labels: generate tick values from $0M to budget
  const tickCount = 7
  const arcLabels: { pct: number; label: string }[] = []
  for (let i = 0; i <= tickCount; i++) {
    const val = Math.round((budget / tickCount) * i)
    arcLabels.push({ pct: i / tickCount, label: `$${val}M` })
  }
  // Add the exact budget as the last label
  arcLabels[tickCount] = { pct: 1, label: `$${Math.round(budget * 10) / 10}M` }

  function polarToXY(angleDeg: number, r: number): [number, number] {
    const rad = (angleDeg * Math.PI) / 180
    return [cx + r * Math.cos(rad), cy - r * Math.sin(rad)]
  }

  // Single smooth arc path (semicircle donut)
  const smoothArc = [
    `M ${cx - outerR} ${cy}`,
    `A ${outerR} ${outerR} 0 1 1 ${cx + outerR} ${cy}`,
    `L ${cx + innerR} ${cy}`,
    `A ${innerR} ${innerR} 0 1 0 ${cx - innerR} ${cy}`,
    `Z`,
  ].join(" ")

  const [gL_x, gL_y] = polarToXY(180, outerGrayR)
  const [gR_x, gR_y] = polarToXY(0, outerGrayR)
  const grayArc = `M ${gL_x} ${gL_y} A ${outerGrayR} ${outerGrayR} 0 0 1 ${gR_x} ${gR_y}`

  const needleAngleDeg = 180 - NEEDLE_PCT * 180
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

  // Circle KPI positions (Mickey Mouse inverted: gauge on top, two circles below)
  const circleR = 62
  const circleY = cy + 200
  const circleLX = cx - 120
  const circleRX = cx + 120

  const content = (
    <div style={{ width: "100%", position: "relative" }}>
      <svg
        width="100%"
        viewBox={`0 0 ${W} ${H}`}
        style={{ display: "block", overflow: "visible" }}
      >
        {/* Smooth gradient definition */}
        <defs>
          <linearGradient id="gaugeGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#E62800" />
            <stop offset="50%" stopColor="#F9DC5C" />
            <stop offset="100%" stopColor="#60A63A" />
          </linearGradient>
        </defs>

        {/* Outer gray arc */}
        <path d={grayArc} fill="none" stroke="#D0D0D0" strokeWidth={2} />

        {/* Arc labels */}
        {arcLabels.map((tick, i) => {
          const angleDeg = 180 - tick.pct * 180
          const [lx, ly] = polarToXY(angleDeg, labelR)
          const anchor = tick.pct < 0.3 ? "start" : tick.pct > 0.7 ? "end" : "middle"
          return (
            <text
              key={i}
              x={lx} y={ly}
              fontSize="14" fontWeight="600" fill="#374151"
              textAnchor={anchor}
              fontFamily="Calibri, Arial, sans-serif"
            >
              {tick.label}
            </text>
          )
        })}

        {/* Smooth color arc */}
        <path d={smoothArc} fill="url(#gaugeGradient)" />

        {/* Thick needle */}
        <polygon
          points={`${tipX},${tipY} ${b1x},${b1y} ${tailX},${tailY} ${b2x},${b2y}`}
          fill="#052F5F"
        />

        {/* Pivot center */}
        <circle cx={cx} cy={cy} r={18} fill="#052F5F" />
        <circle cx={cx} cy={cy} r={11} fill="white" />
        <circle cx={cx} cy={cy} r={5} fill="#052F5F" />

        {/* KPI Value */}
        <text
          x={cx} y={cy + 60}
          fontSize="54" fontWeight="900" fill="#052F5F"
          textAnchor="middle" fontFamily="Calibri, Arial, sans-serif"
        >
          ${value.toFixed(1)}M
        </text>
        <text
          x={cx} y={cy + 95}
          fontSize="21" fill="#374151"
          textAnchor="middle" fontFamily="Calibri, Arial, sans-serif"
          fontWeight="700"
        >
          Prima neta cobrada
        </text>

        {/* Cumplimiento circle (left) */}
        <circle cx={circleLX} cy={circleY} r={circleR} fill="#3983F6" />
        <text
          x={circleLX} y={circleY + 8}
          fontSize="32" fontWeight="900" fill="white"
          textAnchor="middle" fontFamily="Calibri, Arial, sans-serif"
        >
          {cumplimiento}%
        </text>
        <text
          x={circleLX} y={circleY + circleR + 22}
          fontSize="14" fontWeight="700" fill="#374151"
          textAnchor="middle" fontFamily="Calibri, Arial, sans-serif"
        >
          Cumplimiento
        </text>

        {/* Crecimiento circle (right) */}
        <circle cx={circleRX} cy={circleY} r={circleR} fill={crecimiento < 0 ? '#E62800' : '#60A63A'} />
        <text
          x={circleRX} y={circleY + 8}
          fontSize="32" fontWeight="900" fill="white"
          textAnchor="middle" fontFamily="Calibri, Arial, sans-serif"
        >
          {crecimiento < 0 ? "↓" : "↑"} {crecimiento}%
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
