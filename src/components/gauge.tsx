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
  const W = 1000
  const H = 740
  const cx = W / 2
  const cy = 390

  const outerR = 320
  const innerR = outerR * 0.75
  const outerGrayR = outerR + 5
  const labelR = outerR + 32

  const NEEDLE_PCT = 0.75

  // 5 clean labels outside the arc
  const arcLabels = [
    { pct: 0, label: "$0M" },
    { pct: 0.25, label: `$${Math.round(budget * 0.25)}M` },
    { pct: 0.5, label: `$${Math.round(budget * 0.5)}M` },
    { pct: 0.75, label: `$${Math.round(budget * 0.75)}M` },
    { pct: 1, label: `$${Math.round(budget * 10) / 10}M` },
  ]

  function polarToXY(angleDeg: number, r: number): [number, number] {
    const rad = (angleDeg * Math.PI) / 180
    return [cx + r * Math.cos(rad), cy - r * Math.sin(rad)]
  }

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

  const tickR1 = outerR + 2
  const tickR2 = outerR + 12

  const circleR = 62
  const circleY = cy + 200
  const circleLX = cx - 120
  const circleRX = cx + 120

  const content = (
    <div style={{ width: "100%", position: "relative" }}>
      <svg
        width="100%"
        viewBox={`0 0 ${W} ${H}`}
        style={{ display: "block" }}
      >
        <defs>
          <linearGradient id="gaugeGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#E62800" />
            <stop offset="50%" stopColor="#F9DC5C" />
            <stop offset="100%" stopColor="#60A63A" />
          </linearGradient>
        </defs>

        <path d={grayArc} fill="none" stroke="#D0D0D0" strokeWidth={2} />
        <path d={smoothArc} fill="url(#gaugeGradient)" />

        {/* Tick marks + labels OUTSIDE */}
        {arcLabels.map((tick, i) => {
          const angleDeg = 180 - tick.pct * 180
          const [t1x, t1y] = polarToXY(angleDeg, tickR1)
          const [t2x, t2y] = polarToXY(angleDeg, tickR2)
          const [lx, ly] = polarToXY(angleDeg, labelR)
          // Anchor: left labels start, right labels end, middle ones middle
          const anchor = tick.pct < 0.2 ? "start" : tick.pct > 0.8 ? "end" : "middle"
          return (
            <g key={i}>
              <line x1={t1x} y1={t1y} x2={t2x} y2={t2y} stroke="#9CA3AF" strokeWidth={1.5} />
              <text
                x={lx} y={ly}
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
