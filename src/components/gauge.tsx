"use client"

import Link from "next/link"

interface GaugeProps {
  value: number
  prevYear?: number
  budget?: number
  clickable?: boolean
}

const COLOR_STOPS = [
  { pos: 0,    r: 0xCC, g: 0x00, b: 0x00 }, // #CC0000 deep red
  { pos: 0.33, r: 0xFF, g: 0x6B, b: 0x00 }, // #FF6B00 vivid orange
  { pos: 0.66, r: 0xFF, g: 0xD7, b: 0x00 }, // #FFD700 vivid gold
  { pos: 1,    r: 0x00, g: 0x6B, b: 0x3F }, // #006B3F deep green
]

function interpolateColor(t: number): string {
  const c = Math.max(0, Math.min(1, t))
  let i = 0
  for (let j = 0; j < COLOR_STOPS.length - 1; j++) {
    if (c >= COLOR_STOPS[j].pos) i = j
  }
  const a = COLOR_STOPS[i]
  const b = COLOR_STOPS[Math.min(i + 1, COLOR_STOPS.length - 1)]
  const f = b.pos === a.pos ? 0 : (c - a.pos) / (b.pos - a.pos)
  const r = Math.round(a.r + (b.r - a.r) * f)
  const g = Math.round(a.g + (b.g - a.g) * f)
  const bl = Math.round(a.b + (b.b - a.b) * f)
  return `rgb(${r},${g},${bl})`
}

export function Gauge({ value, clickable = true }: GaugeProps) {
  const W = 820
  const H = 580
  const cx = W / 2
  const cy = 420

  const outerR = 380
  const innerR = outerR * 0.75
  const outerGrayR = outerR + 5

  const segCount = 20
  const gapDeg = 2.5
  const totalGap = gapDeg * segCount
  const usableDeg = 180 - totalGap
  const segAngle = usableDeg / segCount

  const NEEDLE_PCT = 0.75

  function polarToXY(angleDeg: number, r: number): [number, number] {
    const rad = (angleDeg * Math.PI) / 180
    return [cx + r * Math.cos(rad), cy - r * Math.sin(rad)]
  }

  // Build segmented arc paths
  const segments: { d: string; color: string }[] = []
  let currentAngle = 180
  for (let i = 0; i < segCount; i++) {
    const startDeg = currentAngle
    const endDeg = startDeg - segAngle

    const [ox1, oy1] = polarToXY(startDeg, outerR)
    const [ox2, oy2] = polarToXY(endDeg, outerR)
    const [ix1, iy1] = polarToXY(endDeg, innerR)
    const [ix2, iy2] = polarToXY(startDeg, innerR)

    const d = [
      `M ${ox1} ${oy1}`,
      `A ${outerR} ${outerR} 0 0 0 ${ox2} ${oy2}`,
      `L ${ix1} ${iy1}`,
      `A ${innerR} ${innerR} 0 0 1 ${ix2} ${iy2}`,
      `Z`,
    ].join(" ")

    const t = i / (segCount - 1)
    segments.push({ d, color: interpolateColor(t) })

    currentAngle = endDeg - gapDeg
  }

  // Outer gray arc
  const [gL_x, gL_y] = polarToXY(180, outerGrayR)
  const [gR_x, gR_y] = polarToXY(0, outerGrayR)
  const grayArc = `M ${gL_x} ${gL_y} A ${outerGrayR} ${outerGrayR} 0 0 1 ${gR_x} ${gR_y}`

  // Needle
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

  // LOW / CRITICAL label positions
  const [lowX, lowY] = [cx - outerR - 10, cy + 20]
  const [critX, critY] = [cx + outerR + 10, cy + 20]

  const content = (
    <div style={{ width: "100%", position: "relative" }}>
      <svg
        width="100%"
        viewBox={`0 0 ${W} ${H}`}
        style={{ display: "block", overflow: "visible" }}
      >
        {/* Outer gray arc */}
        <path d={grayArc} fill="none" stroke="#D0D0D0" strokeWidth={2} />

        {/* Segmented color arc */}
        {segments.map((seg, i) => (
          <path key={i} d={seg.d} fill={seg.color} stroke="none" strokeWidth={0} />
        ))}

        {/* Thick needle */}
        <polygon
          points={`${tipX},${tipY} ${b1x},${b1y} ${tailX},${tailY} ${b2x},${b2y}`}
          fill="#1a1a1a"
        />

        {/* Pivot center — circular */}
        <circle cx={cx} cy={cy} r={18} fill="#333" />
        <circle cx={cx} cy={cy} r={11} fill="white" />
        <circle cx={cx} cy={cy} r={5} fill="#555" />

        {/* CRITICAL label (left, red side) */}
        <text
          x={lowX} y={lowY}
          fontSize="14" fill="#CC0000" textAnchor="middle"
          fontWeight="bold" fontFamily="Calibri, Arial, sans-serif"
        >
          CRITICAL
        </text>

        {/* LOW label (right, green side) */}
        <text
          x={critX} y={critY}
          fontSize="14" fill="#006B3F" textAnchor="middle"
          fontWeight="bold" fontFamily="Calibri, Arial, sans-serif"
        >
          LOW
        </text>

        {/* KPI Value — no background */}
        <text
          x={cx} y={cy + 80}
          fontSize="58" fontWeight="900" fill="#1a1a1a"
          textAnchor="middle" fontFamily="Calibri, Arial, sans-serif"
        >
          ${value.toFixed(1)}M
        </text>
        <text
          x={cx} y={cy + 115}
          fontSize="18" fill="#555"
          textAnchor="middle" fontFamily="Calibri, Arial, sans-serif"
          fontWeight="600"
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
