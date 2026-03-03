"use client"

import Link from "next/link"

interface GaugeProps {
  value: number
  prevYear?: number
  budget?: number
  clickable?: boolean
}

const COLORS = [
  "#1B8A2D", "#2DA83E", "#6BBF1A", "#C5D900", "#F5D000",
  "#F5A623", "#F57C00", "#E64A19", "#D32F2F", "#B71C1C",
]

export function Gauge({ value, clickable = true }: GaugeProps) {
  const W = 500
  const H = 310
  const cx = W / 2
  const cy = 240

  const outerR = 200
  const innerR = outerR * 0.75 // 150
  const borderR = outerR + 10   // 210 — grey frame outside
  const borderInnerR = innerR - 6

  const segCount = 10
  const gapAngle = 1.8 // degrees gap between segments
  const totalGap = gapAngle * (segCount - 1)
  const totalArc = 180 - totalGap
  const segAngle = totalArc / segCount

  // Needle at 75%
  const NEEDLE_PCT = 0.75

  function polarToXY(angleDeg: number, r: number): [number, number] {
    const rad = (angleDeg * Math.PI) / 180
    return [cx + r * Math.cos(rad), cy - r * Math.sin(rad)]
  }

  // Build segment paths
  const segments: string[] = []
  for (let i = 0; i < segCount; i++) {
    const startDeg = 180 - i * (segAngle + gapAngle)
    const endDeg = startDeg - segAngle

    const [ox1, oy1] = polarToXY(startDeg, outerR)
    const [ox2, oy2] = polarToXY(endDeg, outerR)
    const [ix1, iy1] = polarToXY(endDeg, innerR)
    const [ix2, iy2] = polarToXY(startDeg, innerR)

    // Outer arc: sweep-flag=0 (CCW from start to end going right = clockwise visually downward)
    // Since startDeg > endDeg, going from start to end is clockwise in standard math,
    // which in SVG (y-flipped) means the arc goes upward-right. Use sweep=0.
    const d = [
      `M ${ox1} ${oy1}`,
      `A ${outerR} ${outerR} 0 0 0 ${ox2} ${oy2}`,
      `L ${ix1} ${iy1}`,
      `A ${innerR} ${innerR} 0 0 1 ${ix2} ${iy2}`,
      `Z`,
    ].join(" ")
    segments.push(d)
  }

  // Grey border arc (outer frame)
  const [bOuterL_x, bOuterL_y] = polarToXY(180, borderR)
  const [bOuterR_x, bOuterR_y] = polarToXY(0, borderR)
  const borderOuterArc = `M ${bOuterL_x} ${bOuterL_y} A ${borderR} ${borderR} 0 0 1 ${bOuterR_x} ${bOuterR_y}`

  const [bInnerL_x, bInnerL_y] = polarToXY(180, borderInnerR)
  const [bInnerR_x, bInnerR_y] = polarToXY(0, borderInnerR)
  const borderInnerArc = `M ${bInnerR_x} ${bInnerR_y} A ${borderInnerR} ${borderInnerR} 0 0 0 ${bInnerL_x} ${bInnerL_y}`

  const borderPath = [
    borderOuterArc,
    `L ${bInnerL_x} ${bInnerL_y}`,
    borderInnerArc,
    `L ${bOuterL_x} ${bOuterL_y}`,
    `Z`,
  ].join(" ")

  // Needle geometry — 75% of sweep
  const needleAngleDeg = 180 - NEEDLE_PCT * 180 // 45°
  const needleLen = outerR - 8
  const [tipX, tipY] = polarToXY(needleAngleDeg, needleLen)

  const baseHalfWidth = 10
  const perpDeg = needleAngleDeg + 90
  const perpRad = (perpDeg * Math.PI) / 180
  const b1x = cx + baseHalfWidth * Math.cos(perpRad)
  const b1y = cy - baseHalfWidth * Math.sin(perpRad)
  const b2x = cx - baseHalfWidth * Math.cos(perpRad)
  const b2y = cy + baseHalfWidth * Math.sin(perpRad)

  // Tail (short extension behind center)
  const tailLen = 20
  const tailAngleDeg = needleAngleDeg + 180
  const [tailX, tailY] = polarToXY(tailAngleDeg, tailLen)

  const content = (
    <div style={{ width: "100%", position: "relative" }}>
      <svg
        width="100%"
        viewBox={`0 0 ${W} ${H}`}
        style={{ display: "block", overflow: "visible" }}
      >
        {/* Grey border frame */}
        <path d={borderPath} fill="#6B6B6B" opacity={0.55} />

        {/* Color segments */}
        {segments.map((d, i) => (
          <path key={i} d={d} fill={COLORS[i]} />
        ))}

        {/* Needle */}
        <polygon
          points={`${tipX},${tipY} ${b1x},${b1y} ${tailX},${tailY} ${b2x},${b2y}`}
          fill="#3A3A3A"
          stroke="#1a1a1a"
          strokeWidth={0.5}
        />

        {/* Center hub — 3 concentric circles */}
        <circle cx={cx} cy={cy} r={28} fill="#E8E8E8" stroke="#AAAAAA" strokeWidth={3} />
        <circle cx={cx} cy={cy} r={18} fill="#F5F5F5" stroke="#BDBDBD" strokeWidth={2} />
        <circle cx={cx} cy={cy} r={9} fill="#FAFAFA" stroke="#CCCCCC" strokeWidth={1.5} />

        {/* LOW label */}
        <text
          x={cx - outerR - 10}
          y={cy + 20}
          fontSize="15"
          fill="#1B8A2D"
          textAnchor="middle"
          fontWeight="900"
          fontFamily="Calibri, Arial, sans-serif"
          letterSpacing="2"
        >
          LOW
        </text>

        {/* CRITICAL label */}
        <text
          x={cx + outerR + 10}
          y={cy + 20}
          fontSize="15"
          fill="#B71C1C"
          textAnchor="middle"
          fontWeight="900"
          fontFamily="Calibri, Arial, sans-serif"
          letterSpacing="1"
        >
          CRITICAL
        </text>

        {/* Value display */}
        <text
          x={cx}
          y={cy + 48}
          fontSize="36"
          fontWeight="900"
          fill="#111827"
          textAnchor="middle"
          fontFamily="Calibri, Arial, sans-serif"
        >
          ${value.toFixed(1)}M
        </text>
        <text
          x={cx}
          y={cy + 68}
          fontSize="12"
          fill="#6B7280"
          textAnchor="middle"
          fontFamily="Calibri, Arial, sans-serif"
          fontWeight="500"
        >
          Prima neta cobrada
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
